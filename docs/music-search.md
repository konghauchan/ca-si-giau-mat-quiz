# Danh mục bài hát Đọ Nhạc

## Cách dùng

Chọn phạm vi Nhạc Việt (ngôn ngữ lời `vie`) hoặc US–UK (tiếng Anh quốc tế `eng`, không đồng thời có `vie`). Mỗi vòng có thể chọn cách trả lời tìm bài hát. Người tạo chọn bài từ danh mục để liên kết đáp án; người chơi tìm theo một phần tên bài hoặc ca sĩ, có hỗ trợ không dấu, alias và sai một chữ trong tên nghệ sĩ.

Chọn một mục bằng chuột hoặc phím mũi tên + Enter là gửi đáp án ngay. Nghe chung trả lời sai được tìm tiếp; đấu giá và gợi ý vẫn theo luật một lần. Server chấm Work ID đã ký, kiểm tra phạm vi và thời hạn; trình duyệt không tự quyết định điểm.

## Nhập metadata vào danh mục riêng

```powershell
python scripts/collect-song-catalog.py --target 20000
python -m unittest discover -s tests -p catalog_import_test.py
```

- Nguồn: MusicBrainz public API và thống kê tổng hợp ListenBrainz (CC0). Chỉ xuất core metadata theo CC0: mã/tên tác phẩm, ngôn ngữ, tác giả, quan hệ bản thu và credit nghệ sĩ. Không tải audio, video, lời bài hát, ảnh, rating hoặc tag.
- Tệp dùng trong app: `src/lib/musicCatalogPopular.json`. Manifest ghi nguồn, thời điểm, tiêu chí, số bài từng phạm vi, mục tiêu và trạng thái hoàn tất. Mỗi bài nhập mới có Work ID, Recording ID được dùng đối chiếu credit, ngôn ngữ và số bản thu liên kết.
- Tiêu chí: Song có ngôn ngữ rõ ràng, có ít nhất một bản thu liên kết và credit ca sĩ thật. Loại nhãn chung Various Artists/unknown và chuỗi lỗi ký tự thay thế. Không dùng tác giả làm ca sĩ; không suy ngôn ngữ theo quốc tịch hoặc tên nghệ sĩ. Một Work chỉ xuất hiện một lần, không nhân bản vì live/remix/cover. Hiển thị credit của một bản thu, không ghép các ca sĩ cover thành một nhóm.
- Trước tiên đối chiếu các bản thu trong top 1.000 all-time của cộng đồng ListenBrainz với Work/ngôn ngữ/credit trên MusicBrainz. Lưu số lượt nghe tổng hợp và thời điểm cập nhật, không lưu người nghe. Sau đó thu toàn bộ ứng viên tiếng Việt đủ dữ liệu; nhóm tiếng Anh đi theo các dải số bản thu giảm dần. Số bản thu là chỉ dấu độ phủ trong MusicBrainz, **không phải lượt stream, bảng xếp hạng toàn cầu hay bảo đảm 20.000 bài đều là hit**. Độ phủ tiếng Việt phụ thuộc nguồn; không tự bù ngôn ngữ cho bài thiếu dữ liệu.
- `src/lib/musicCatalogSeed.json` giữ các nhãn/alias đã đối chiếu trước đó và được ưu tiên khi trùng ID. ID và đáp án của quiz cũ không đổi. Danh mục này được đóng gói cùng server khi deploy, không lấy dữ liệu từ quiz riêng tư và không ghi đè quiz/phòng trên Turso.
- Cache và checkpoint nằm trong `data/catalog-import/` (bị gitignore). Chạy lại cùng lệnh để tiếp tục; không tải lại những response đã lưu. Chỉ một request ngoài tại một thời điểm, cách nhau ít nhất 1,2 giây sau response; timeout 60 giây, tối đa 7 lần thử có backoff. Lỗi vĩnh viễn dừng ngay. Không đánh dấu hoàn tất nếu chưa đủ mục tiêu.
- API search chỉ cho xem tối đa 500 kết quả của một truy vấn: chia theo prefix UUID Work để phân trang hết, không cố tăng offset qua giới hạn. Không tạo ID giả để đủ số lượng.

Nguồn và giấy phép: https://listenbrainz.org/data/ ; https://musicbrainz.org/doc/About/Data_License ; API: https://musicbrainz.org/doc/MusicBrainz_API/Search ; giới hạn: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting .

## Tải và tìm nhanh

- `songSelections.ts` giữ ký/xác minh đáp án tách khỏi thư viện tìm kiếm; game/command/state không kéo theo chỉ mục 20.000 bài khi chỉ cần chấm một token.
- Danh mục tĩnh được kết hợp với tối đa 5.000 mục cache công khai trong bảng `music_catalog`; giới hạn cache này không cắt bớt 20.000 bài đóng gói. Không join vào questions/answers để tạo gợi ý. Metadata tĩnh không hết hạn sau 30 ngày; chỉ cache tìm ngoài mới có TTL.
- `/api/music/catalog` kiểm tra tài khoản người tạo hoặc token người chơi trong phòng có SEARCH; scope của người chơi lấy từ quiz phía server. `offset` 0–30.000, `limit` 1–4.000; mỗi trang còn bị chặn ở 3 MB để ở dưới giới hạn response Vercel. Response có `items`, `total`, `nextOffset`; null nghĩa là hết.
- Trình duyệt tải nối tiếp từng trang, chia sẻ một lượt tải khi nhiều component gọi, giữ tối đa 30.000 mục mỗi scope. Mỗi trang đến là có thể tìm ngay, không chờ toàn bộ. Không âm thầm dừng ở 5.000 bài như trước. Kết quả có token do server ký; provenance nguồn chỉ nằm trên server, không gửi lặp xuống máy người chơi.
- Chỉ mục chuẩn hóa và sắp xếp một lần khi thêm trang. Khi gõ, lọc trên máy, giới hạn hiển thị 20 bài; memoize độ khớp theo nghệ sĩ trong mỗi truy vấn. Không gọi provider cho nghệ sĩ đã có dữ liệu đủ mạnh.
- Bài mới ngoài danh mục vẫn có thể tìm thêm: Artist exact/alias trước, prefix/fuzzy sau; Recording theo đúng nghệ sĩ; Work theo Recording IDs và ngôn ngữ. Tựa bài khớp một phần không chặn việc tìm nghệ sĩ (Queen of My Heart không phải ban nhạc Queen).
- Cache Artist/Recording/Work riêng 24 giờ (rỗng 1 giờ), query cache 7 ngày (rỗng 1 giờ), catalog tích lũy 30 ngày. Khóa provider chia sẻ trên Turso, không tăng tải API công cộng khi 30 người cùng tìm. Đang chờ trả 202 để client tự thử có giới hạn; 429 chỉ dành cho vượt số lượt của một người. Thiếu Work/ngôn ngữ trả thông báo cụ thể, không biến lỗi provider thành rỗng thành công.

## Kiểm tra

```powershell
node --experimental-strip-types --test --test-isolation=none tests/*.test.ts
node --experimental-strip-types scripts/benchmark-song-catalog.mjs
```

API smoke chỉ chạy với database test có `rounds-smoke` trong đường dẫn, không có TURSO_DATABASE_URL. Kiểm tra toàn bộ trang của hai phạm vi, mục cuối danh mục, quyền truy cập, token giả/sai phạm vi, không lộ đáp án, 30 người và luật OPEN/BID/CLUE. Benchmark chỉ đo chỉ mục client, không đại diện độ trễ mạng hoặc khả năng chịu tải toàn server.
