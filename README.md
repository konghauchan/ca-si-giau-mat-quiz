# BID//REVEAL

Trò chơi đoán bài hát cho 2–4 người với hai vòng dùng hai nhóm bài hát riêng. Vòng 1 mọi người cùng nghe 3–10 giây và đoán; vòng 2 người chơi bí mật chọn số giây cần nghe. Nhóm chọn ít giây nhất nghe trước; người chọn trùng thời gian nghe và trả lời cùng lúc. Nếu cả nhóm sai hoặc hết giờ, hệ thống báo cho cả phòng và công bố người nghe tiếp theo.

## Chạy local

Yêu cầu Node.js 24+ (dùng `node:sqlite`) và npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`. Trên Windows có thể tạo `.env.local` bằng cách sao chép file trong Explorer; biến môi trường không bắt buộc vì mặc định dùng `./data/game.sqlite`.

1. Vào **Tạo bộ câu hỏi**. Tạo ít nhất một câu mỗi vòng bằng các bài hát khác nhau. Vòng 1 chọn thời lượng nghe chung; vòng 2 nhập gợi ý trước khi đấu giá. Mỗi câu chọn thời gian trả lời từ 5 đến 60 giây, nhập đường dẫn YouTube, thời điểm bắt đầu và đáp án.
2. Tại **Thư viện**, bấm **Tạo phòng**, nhập tên hiển thị và chọn một trong 20 avatar. Người tạo phòng chiếm một trong bốn vị trí chơi và nhận mã phòng 6 số.
3. Mở thêm 1–3 thẻ trình duyệt (hoặc thiết bị cùng mạng), vào `/join`, nhập mã phòng, tên hiển thị và chọn avatar. Không cần đăng nhập. Mỗi vị trí có màu riêng xuyên suốt trận đấu.
4. Người tạo bắt đầu vòng 1: tất cả cùng nghe rồi trả lời. Hết các câu vòng 1, vòng 2 tự bắt đầu: người chơi chọn số giây, nghe khi tới lượt và nhập đáp án. Nếu nhóm trước không đoán đúng, cả phòng thấy thông báo và tên người nghe tiếp theo trong 3 giây.
5. Kết quả hiển thị 4 giây, sau đó bảng điểm hiển thị 4 giây; câu tiếp theo tự bắt đầu. Người tạo phòng vẫn có nút chuyển ngay.

Có thể chạy `npm run seed` để thêm quiz công khai **Đoán bài hát Việt** với 3 câu mẫu. Các YouTube URL và đáp án trong quiz seed là **placeholder**, không phát được. Khi seed, terminal in ra owner token; để chỉnh sửa quiz seed qua UI, lưu `localStorage` key `quiz:<quiz-id>` với token đó, hoặc dùng nút **Dùng mẫu 3 câu hỏi** trong trang tạo quiz và thay URL/đáp án trước khi lưu.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run smoke` chạy luồng API 4 người gồm host với quiz test mới. Test kiểm tra vòng nghe chung, chuyển sang vòng bid, giới hạn 4 người, bid bí mật, đồng bid, escalation, answer matching, xếp điểm theo tốc độ và game end.

`npm run media-smoke` kiểm tra upload audio, gợi ý trong phase bidding, quyền preview và quyền nhận clip, cùng đoạn clip đúng 1 giây.

## Triển khai Vercel

Bản đang chạy: https://ca-si-giau-mat-quiz.vercel.app (dự án `ca-si-giau-mat-quiz` trong tài khoản Vercel Kong Hau Chan). Mã nguồn nằm trong repo GitHub riêng tư `konghauchan/ca-si-giau-mat-quiz`, nhánh `main` được kết nối với dự án Vercel. Sau khi sửa, kiểm tra bằng các lệnh ở mục **Kiểm tra**, commit và `git push origin main`; Vercel tự tạo bản Production mới. Database `ca-si-giau-mat-quiz-db` dùng gói Turso Starter miễn phí, vùng Tokyo. Đã chuyển 4 quiz và 12 bài hát từ máy lên database này. Các lần deploy tiếp theo tiếp tục dùng database hiện tại.

Bản online dùng Turso Cloud làm SQLite bền vững. Tích hợp Turso từ Vercel Marketplace để dự án nhận `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` cho Production và Preview. Dự án chạy Node.js 24.x. Chạy `npm run migrate-quizzes` với hai biến kết nối này để chuyển quiz local sang Turso trước khi mở bản online. Script bỏ qua quiz mẫu có URL giữ chỗ và dữ liệu kiểm thử có tên bắt đầu bằng `Smoke`; chỉ chuyển quiz, bài hát và đáp án, không chuyển các phòng chơi cũ.

Quyền sửa quiz nằm trong localStorage theo từng tên miền. Sau khi chuyển database, tại trang `/quizzes` trên localhost bấm **Sao chép mã quản lý**; trên trang online bấm **Nhập mã quản lý** và dán mã. Mã chứa token sở hữu nên không chia sẻ cho người khác. Quiz mới tạo trực tiếp trên online không cần bước này.

Quiz online chỉ hỗ trợ đường dẫn YouTube. Tệp âm thanh lưu trên máy local không được chuyển lên Vercel.

## Kiến trúc

- `src/lib/core.ts`: grouping bid, chọn nhóm tiếp theo, công thức điểm, chuẩn hóa đáp án, xác thực YouTube URL. Không phụ thuộc React hay database.
- `src/lib/game.ts`: game engine và server authority. API chỉ gọi intents đã xác thực bằng token host/player. Mọi thay đổi room/bid/answer/score/event nằm trong transaction SQLite.
- `src/lib/db.ts`, `schema.sql`: truy vấn SQLite bất đồng bộ qua libSQL; local lưu tại `data/game.sqlite`, online lưu trên Turso. `schema.sql` được áp dụng khi khởi tạo kết nối; các bảng gồm quizzes, questions, accepted_answers, rooms, players, bids, answers, score_events, game_events.
- `src/app/api`: HTTP command/state và event stream SSE. SSE gửi version của event log; client fetch state với token. Fallback poll 5 giây.
- `src/components/AudioClipPlayer.tsx`, `src/lib/media.ts`: adapter audio tải lên. File gốc nằm tại `MEDIA_DIR`, ngoài thư mục public. API xác thực challenger và dùng FFmpeg để chỉ gửi đoạn từ `mediaStart` với độ dài bid; client không nhận cả bài hoặc thanh tua. Creator preview đoạn tối đa 10 giây bằng token upload.
- `src/components/ClipPlayer.tsx`: YouTube IFrame adapter. Trong game, lớp che phủ player giữ tiêu đề và ảnh bìa khỏi màn hình; preview của người tạo vẫn hiện player gốc.
- `src/components/GameRoom.tsx`: UI player/host gửi intent và render state server. Avatar được lưu bằng mã 1–20 trong bảng `players`; bốn màu nhận diện gắn với thứ tự tham gia, không đổi khi bảng điểm sắp xếp lại.

Luồng trạng thái: `LOBBY → OPEN_MEDIA_PLAYING → OPEN_ANSWERING → ROUND_RESULT → SCOREBOARD` cho các câu vòng 1, rồi `BIDDING → BID_REVEAL → MEDIA_PLAYING → ANSWERING → ROUND_RESULT → SCOREBOARD` cho các câu vòng 2. Khi nhóm đang nghe không đoán đúng và vẫn còn nhóm khác, `ANSWERING → TURN_TRANSITION → MEDIA_PLAYING`. Thời gian trả lời theo từng câu; sau kết quả và bảng điểm, hệ thống tự chuyển câu hoặc kết thúc trò chơi. Giới hạn thời gian được xử lý trên máy chủ khi có yêu cầu trạng thái hoặc sự kiện. Người tạo phòng có thể kết thúc đấu giá, bỏ qua câu và kết thúc trò chơi.

Vòng 1 có 500 điểm cơ bản mỗi câu; các đáp án đúng nhận lần lượt 100%, 75%, 50%, 25% theo thứ tự server nhận. Vòng 2 điểm cơ bản giảm khi bid nhiều giây; nhóm trùng bid chia điểm theo cùng thứ tự. Đáp án sai không chiếm thứ hạng. Mỗi vòng dùng bài hát khác nhau để tránh lộ đáp án trước khi bid.

Phản hồi gameplay không gửi `primary_answer`/`accepted_answers` trước `ROUND_RESULT`. Bid của người khác không gửi trước `BID_REVEAL`; media URL chỉ gửi cho challenger đang nghe và sau kết quả. Token player/host nằm trong `localStorage` cùng trình duyệt để refresh khôi phục phiên. Host có thể mất kết nối tạm thời; state và timer vẫn được lưu trong SQLite, rồi tiếp tục khi có request.

## Quyết định MVP và giới hạn

- Local dùng SQLite trên ổ đĩa; bản Vercel dùng Turso Cloud để các Function cùng đọc và ghi một database bền vững.
- SSE cập nhật gần realtime; timer thực thi khi có request, nên nếu tất cả client đều offline, phase sẽ được cập nhật ở request đầu tiên sau khi họ quay lại.
- Mỗi câu hỏi mới cần gợi ý trước bid. Quiz cũ có `hint` trống sẽ hiện thông báo thiếu gợi ý cho tới khi được thay/cập nhật.
- Quiz đã được dùng trong một room được lưu thành phiên bản mới khi chỉnh sửa; phòng cũ vẫn dùng nội dung trước đó.
- Quiz tạo trước bản hai vòng được giữ nguyên và mặc định thuộc vòng 2. Để tạo phòng mới, mở quiz trong editor, dùng **Lưu bản mới** và phân ít nhất một bài hát sang vòng 1; các phòng đã tạo trước đó vẫn giữ dữ liệu cũ.
- Quiz mới chỉ dùng YouTube embed. Dữ liệu quiz gồm URL và thông tin câu hỏi trong SQLite; backend local vẫn giữ khả năng đọc file audio của quiz cũ. Bản online không lưu tệp âm thanh.
- Khi tới lượt, player tự thử phát và tự dừng sau đúng số giây bid; nếu trình duyệt chặn autoplay, người chơi bấm **Phát**. Video bị chặn nhúng có thể báo lỗi; host dùng **Bỏ qua câu hỏi**.
- Lớp che YouTube đáp ứng yêu cầu giao diện nhưng trái với mục “Overlays and frames” trong [YouTube Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality). YouTube có thể hạn chế player; cần cân nhắc trước khi phát hành công khai. Lớp che chỉ ngăn lộ thông tin trên giao diện, không thể ngăn người chơi mở video gốc bằng URL hoặc công cụ trình duyệt.
- Guest token lưu localStorage; nếu xóa dữ liệu trình duyệt sẽ mất quyền host/player/quiz. Chưa có tài khoản, rate limiting, moderation, tự động rời phòng, hay xử lý YouTube lỗi theo từng player.
- Giao diện hỗ trợ sắp xếp câu hỏi bằng nút lên/xuống; chưa hỗ trợ kéo thả.
