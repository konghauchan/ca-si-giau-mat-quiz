# Hiệu năng và chế độ gợi ý

## Phạm vi

Giữ Next.js, Turso, token phiên chơi và hai vòng nghe nhạc hiện có. `SONG_CLUE` dùng bộ máy trạng thái riêng, không tải YouTube hoặc âm thanh. Chỉ vòng 1 nghe chung cho nhập lại sau đáp án sai; vòng 2 và gợi ý giữ luật một lần trả lời.

## Những điểm gây trễ đã xác nhận

- Functions ở Washington (`iad1`), database ở Tokyo. Các truy vấn nối tiếp phải đi qua hai khu vực.
- Client tải toàn bộ state định kỳ; server thực hiện nhiều truy vấn nối tiếp và đôi khi giữ transaction ghi trong lúc dựng response.
- Bốn người sẵn sàng đồng thời có thể gặp `SQLITE_BUSY`. Các tab dùng chung localStorage cũng có thể ghi đè token người chơi.

## Thay đổi

- `vercel.json` đặt Functions ở Tokyo (`hnd1`), cùng khu vực với Turso. Đây là vùng cố định gần nhóm người chơi Việt Nam, không tự chọn database primary theo từng người.
- Gom truy vấn snapshot bằng libSQL batch; commit thao tác trước khi dựng response. Migration thêm cột/index trong transaction, không chạy DDL ở mọi cold start online.
- Một luồng SSE cho mỗi client gửi snapshot đầu tiên và patch khi có thay đổi. Probe version/deadline nhẹ được chia sẻ trong từng function instance, cách nhau 250 ms; không có vòng poll state song song khi stream hoạt động. Có fallback và reconnect.
- Server giữ deadline; client chỉ hiển thị đếm ngược. Button hiển thị trạng thái chờ ngay, kết quả đúng/sai và điểm lấy từ server. Không đưa đáp án bí mật xuống client để đoán đúng/sai trước khi xác nhận.
- Transaction ghi xếp hàng trong từng process và thử lại khi transaction đã rollback do khóa. Giữa các instance, khóa database quyết định người giành quyền trước. Unique index chặn ghi điểm gợi ý trùng.
- Token phòng ưu tiên sessionStorage, giúp bốn tab giữ bốn danh tính riêng.
- `Server-Timing` trên command/state/room đo tổng thời gian, DB và số lượt truy vấn; log chi tiết chỉ bật trong development với `GAME_TIMING=1`.

## Database

Migration bổ sung `quizzes.game_type`, `questions.clues_json`, `rooms.clue_state`, `players.ready`, các index theo room/question và unique score event. Quiz cũ mặc định `MUSIC_BID`; dữ liệu cũ được giữ lại. Gợi ý gồm nội dung, nhóm và điểm; state phòng lưu clue hiện tại, deadline, holder, votes và người bị loại.

## Chế độ gợi ý

Trong trang tạo quiz chọn **Đoán bài hát qua gợi ý**. Mặc định 10 câu; mỗi câu 5 gợi ý với điểm 1000/800/600/400/200, có thể sửa điểm, thứ tự và thời gian. Có ba câu mẫu và preview.

Bốn người sẵn sàng tự bắt đầu. Người giành quyền đầu tiên có 8 giây mặc định; sai/hết giờ bị loại khỏi câu đó. Đủ `ceil(75% × người còn quyền)` phiếu thì mở gợi ý tiếp; deadline cũng mở tự động. Đúng cộng điểm đã khóa, hiện đáp án, chuyển câu; đồng điểm đồng hạng. Chuẩn hóa tiếng Việt và alias, không fuzzy matching.

## Kiểm tra tái lập

```powershell
npm run lint
npm test
npm run build
$env:DATABASE_PATH='./data/test.sqlite'
npm start -- --port 3210
# Terminal khác, cùng DATABASE_PATH
npm run smoke
npm run clue-smoke
npm run performance
```

`clue-smoke` chỉ chạy local và rút ngắn deadline bằng SQLite trên database test. `clue-online-smoke` dùng deadline thật, không can thiệp database. Cả hai tạo fixture không công khai, kiểm tra 4 người, race buzzer, không cộng điểm hai lần và SSE. `seed-clue` tạo bộ ba câu mẫu; token chủ sở hữu chỉ lưu trong thư mục data bị gitignore.

## Giới hạn

SSE hiện dùng database probe, chưa có dịch vụ pub/sub. Nhiều phòng/instance sẽ tăng số lượt đọc; cần đo tải thực tế trước khi mở quy mô lớn. Khi tất cả client ngắt kết nối, không có worker nền: lần truy cập tiếp theo bắt kịp các deadline đã lưu, không bắt đầu lại bộ đếm. Cold start, đường truyền và vùng người chơi vẫn ảnh hưởng độ trễ; số đo local không chứng minh mục tiêu dưới 500 ms online.

## Số đo ngày 04/10/2026

Đo từ máy tại Việt Nam, cùng script và 4 người gửi request đồng thời. Baseline `341726b` ở iad1; bản mới `4daaa94` ở hnd1, được xác minh bằng header `x-vercel-id`. Mẫu nhỏ, gồm cả những request đầu tiên; không phải kiểm tra tải nhiều phòng.

| HTTP thao tác | Trước p50 / p95 (ms) | Sau p50 / p95 (ms) | Số mẫu mỗi bản |
| --- | ---: | ---: | ---: |
| Vào phòng | 2931 / 9649 | 421 / 490 | 3 |
| Đọc trạng thái 4 người | 3823 / 5761 | 201 / 1091 | 12 |
| Tạo phòng | 1739 / 1739 | 283 / 283 | 1 |
| Bắt đầu | 4805 / 4805 | 360 / 360 | 1 |
| Lưu quiz | 2764 / 2764 | 1330 / 1330 | 1 |

Trận gợi ý online chạy hết 3 câu với 4 HTTP/SSE client: tất cả nhận holder sau **418 ms**, tất cả nhận kết quả đúng/điểm sau **438 ms** ở lần đo cuối. Đồng hồ đo SSE chạy độc lập với response của các thao tác thua cuộc, tránh tính thời gian chờ người thua thành độ trễ broadcast. HTTP answer thành công p50 267 ms / p95 433 ms (4 mẫu). Các thao tác khác vẫn có spike: join 1266 ms, ready 903 ms, buzz 707 ms trong trận này. Do đó chưa cam kết mọi thao tác dưới 500 ms.

Local production: 17 unit tests, smoke hai vòng nghe nhạc, smoke gợi ý rút ngắn deadline và smoke gợi ý deadline thật đều qua. Snapshot local p50 35 ms / p95 114 ms; baseline 34 / 92 ms, nên không kết luận cải thiện local từ mẫu này. SSE gợi ý local 212 ms ở bài kiểm tra race. Migration trên bản sao schema cũ giữ quiz và thêm index thành công. UI được chơi trên 4 tab riêng và kiểm tra ở 390 px; không phải 4 thiết bị vật lý.

Các file báo cáo đầy đủ trong `data/performance-online-before.json`, `data/performance-online-after.json`, `data/clue-online-performance.json`, `data/clue-performance.json` (gitignore). Không chứa token người chơi; fixture seed có token nằm trong file riêng bị gitignore.
