# Đọ Nhạc

Trò chơi đoán bài hát cho 2–4 người. Quiz mới thuộc **Đọ Nhạc** và có thể thêm nhiều vòng; mỗi vòng chọn **Nghe chung**, **Đấu giá thời gian** hoặc **Đoán qua 6 gợi ý**. Có thể lặp lại luật ở nhiều vòng, tối đa 60 bài trong một quiz. Người tạo phòng cũng là một người chơi. Quiz và phòng cũ tiếp tục dùng nội dung, luật đã lưu.

### Cấu hình vòng chơi

Trong trang tạo/chỉnh sửa, bấm **Thêm vòng chơi**, chọn luật ở **Luật chơi vòng…**, rồi thêm chủ đề và bài hát. Xóa vòng sẽ xóa các bài trong vòng đó sau xác nhận; các vòng sau được đánh số lại. Vòng nghe chung cho thử lại đáp án sai (tối đa 30 lần/câu); đấu giá chỉ cho trả lời một lần; gợi ý loại người trả lời sai khỏi câu. Các vòng chuyển tự động qua màn kết quả và bảng điểm, điểm được cộng xuyên suốt quiz. Quiz mới do host bắt đầu; phòng gợi ý cũ vẫn dùng cơ chế 4 người sẵn sàng.

Luật của quiz mới lưu bằng loại câu hỏi `music_open`, `music_bid`, `song_clue`, độc lập với số vòng. Không cần thêm cột hay chuyển dữ liệu Turso. `tests/rounds-smoke.mjs` kiểm tra 5 vòng với 4 người, lưu/mở lại, thử lại đáp án, tạm dừng và đặt lại quyền ở câu mới. Chạy với server và test cùng `DATABASE_PATH=./data/rounds-smoke.sqlite`, cổng 3210 (chỉ dùng database kiểm thử local).

## Chạy local

Yêu cầu Node.js 24+ (dùng `node:sqlite`) và npm.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`. Trên Windows có thể tạo `.env.local` bằng cách sao chép file trong Explorer; biến môi trường không bắt buộc vì mặc định dùng `./data/game.sqlite`.

1. Đăng ký hoặc đăng nhập bằng email và mật khẩu (ít nhất 12 ký tự), rồi vào **Tạo bộ câu hỏi**. Có thể chọn ảnh bìa JPG, PNG, WebP hoặc AVIF tối đa 8 MB; trình duyệt và máy chủ sẽ cắt giữa thành 4:3, nén WebP tối đa 300 KB. Trong mỗi tab vòng chơi, thêm một hoặc nhiều chủ đề, đặt tên và số bài hát cần có. Mỗi chủ đề phải đủ đúng số bài trước khi lưu; một video YouTube không thể dùng lại ở chủ đề hay vòng khác. Vòng 1 chọn thời lượng nghe chung; vòng 2 nhập gợi ý trước khi đấu giá. Mỗi bài chọn thời gian trả lời từ 5 đến 60 giây, nhập đường dẫn YouTube, thời điểm bắt đầu từ 0 giây trở đi và đáp án. Bấm **Xem như người chơi** để kiểm tra từng bước của câu hỏi trước khi lưu.
2. Tại **Thư viện**, bấm **Tạo phòng**, nhập tên hiển thị và chọn một trong 20 avatar. Người tạo phòng chiếm một trong bốn vị trí chơi và nhận mã phòng 6 số.
3. Mở thêm 1–3 thẻ trình duyệt (hoặc thiết bị cùng mạng), vào `/join`, nhập mã phòng, tên hiển thị và chọn avatar. Không cần đăng nhập. Mỗi vị trí có màu riêng xuyên suốt trận đấu.
   Quiz mới mặc định **Riêng tư** và chỉ hiện trong thư viện của tài khoản tạo. Bấm **Chia sẻ** trên thẻ quiz để chuyển sang **Ai có liên kết** và sao chép URL `/quiz/<id>`; người mở link bằng ẩn danh có thể xem thông tin quiz và tạo phòng, nhưng không xem được câu hỏi, đáp án hoặc chỉnh sửa quiz. Có thể chọn **Công khai** để quiz xuất hiện trong thư viện mọi người, hoặc **Tắt chia sẻ** để chặn truy cập bằng link. Link cũ vẫn dẫn đến bản mới khi quiz được chỉnh sửa sau khi đã tạo phòng.
4. Người tạo bắt đầu vòng 1: chủ đề mới hiện 3 giây trước bài đầu tiên, sau đó tất cả cùng nghe rồi trả lời. Vòng 1 cho phép gửi nhiều đáp án khác nhau trong thời gian trả lời, tối đa 30 lần mỗi người mỗi câu; đáp án đúng được chốt. Vòng 2 mỗi người chỉ được gửi một đáp án. Các chủ đề chạy lần lượt trong từng vòng; hết vòng 1, vòng 2 tự bắt đầu. Nếu nhóm trước không đoán đúng, cả phòng thấy thông báo và tên người nghe tiếp theo trong 3 giây.
5. Với bài YouTube, màn kết quả hiện tên bài hát, ca sĩ và video tự phát từ mốc đã đặt; nếu chưa đặt đoạn công bố riêng thì phát 4 giây từ mốc nghe nhạc. Nếu trình duyệt chặn tự phát, người chơi có nút phát dự phòng. Bảng điểm hiển thị sau đó 4 giây và câu tiếp theo tự bắt đầu. Trong lúc chơi, YouTube không hiện thanh tua và không nhận phím tắt tua.

Có thể chạy `npm run seed` để thêm quiz công khai **Đoán bài hát Việt** với 3 câu mẫu. Các YouTube URL và đáp án trong quiz seed là **placeholder**, không phát được. Để tạo quiz mẫu thuộc tài khoản, dùng nút **Dùng mẫu 3 câu hỏi** trong trang tạo quiz và thay URL/đáp án trước khi lưu.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run auth-smoke` kiểm tra đăng ký, đăng nhập, quyền quản lý quiz theo tài khoản và khả năng chơi ẩn danh; chạy khi website local đang mở. Với database local cũ, đặt `TEST_DATABASE_PATH` trỏ tới file SQLite để kiểm tra cả việc nhận lại quiz cũ bằng mã sở hữu.

`npm run smoke` chạy luồng API 4 người gồm host với quiz test mới. Test kiểm tra vòng nghe chung, chuyển sang vòng bid, giới hạn 4 người, bid bí mật, đồng bid, escalation, answer matching, xếp điểm theo tốc độ và game end.

`npm run media-smoke` kiểm tra upload audio, gợi ý trong phase bidding, quyền preview và quyền nhận clip, cùng đoạn clip đúng 1 giây.

## Triển khai Vercel

Bản đang chạy: https://nghe-va-doan.vercel.app (dự án `ca-si-giau-mat-quiz` trong tài khoản Vercel Kong Hau Chan; tên miền cũ `ca-si-giau-mat-quiz.vercel.app` chuyển hướng tới đây). Mã nguồn nằm trong repo GitHub riêng tư `konghauchan/ca-si-giau-mat-quiz`, nhánh `main` được kết nối với dự án Vercel. Sau khi sửa, kiểm tra bằng các lệnh ở mục **Kiểm tra**, commit và `git push origin main`; Vercel tự tạo bản Production mới. Database `ca-si-giau-mat-quiz-db` dùng gói Turso Starter miễn phí, vùng Tokyo. Đã chuyển 4 quiz và 12 bài hát từ máy lên database này. Các lần deploy tiếp theo tiếp tục dùng database hiện tại.

Bản online dùng Turso Cloud làm SQLite bền vững. Tích hợp Turso từ Vercel Marketplace để dự án nhận `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` cho Production và Preview. Dự án chạy Node.js 24.x. Chạy `npm run migrate-quizzes` với hai biến kết nối này để chuyển quiz local sang Turso trước khi mở bản online. Script bỏ qua quiz mẫu có URL giữ chỗ và dữ liệu kiểm thử có tên bắt đầu bằng `Smoke`; chỉ chuyển quiz, bài hát và đáp án, không chuyển các phòng chơi cũ.

Quiz mới được tạo trực tiếp trên website online và lưu trong Turso, gắn với tài khoản email đã đăng nhập. Phiên đăng nhập dùng cookie HttpOnly; database chỉ giữ mã băm mật khẩu và phiên. Quiz tạo trước khi có đăng nhập được chuyển vào tài khoản khi đăng nhập bằng chính trình duyệt còn giữ mã sở hữu. Nếu mã sở hữu cũ đã mất, hệ thống chưa thể tự xác định chủ quiz. Chưa có dịch vụ gửi email, nên hiện chưa xác minh email hoặc đặt lại mật khẩu.

Ảnh bìa quiz được lưu trong Vercel Blob public store `ca-si-giau-mat-quiz-blob` tại Singapore; Turso chỉ giữ URL. Dự án Vercel đã được kết nối với store cho Production và Preview bằng `BLOB_READ_WRITE_TOKEN`. Muốn thử tải ảnh lên khi chạy local, cần cung cấp token này trong `.env.local`; không có token vẫn tạo và chơi quiz không ảnh bìa được. Chỉ người sở hữu quiz mới có thể thay hoặc xóa ảnh qua API.

Quiz online chỉ hỗ trợ đường dẫn YouTube. Tệp âm thanh lưu trên máy local không được chuyển lên Vercel.

## Kiến trúc

- `src/lib/core.ts`: grouping bid, chọn nhóm tiếp theo, công thức điểm, chuẩn hóa đáp án, xác thực YouTube URL. Không phụ thuộc React hay database.
- `src/lib/game.ts`: game engine và server authority. API chỉ gọi intents đã xác thực bằng token host/player. Mọi thay đổi room/bid/answer/score/event nằm trong transaction SQLite.
- `src/lib/db.ts`, `schema.sql`: truy vấn SQLite bất đồng bộ qua libSQL; local lưu tại `data/game.sqlite`, online lưu trên Turso. `schema.sql` được áp dụng khi khởi tạo kết nối; các bảng gồm users, user_sessions, auth_rate_limits, quizzes, topics, questions, accepted_answers, rooms, players, bids, answers, score_events, game_events. Quiz cũ không có chủ đề vẫn mở được và khi chỉnh sửa sẽ dùng chủ đề chung cho mỗi vòng.
- `src/app/api`: HTTP command/state và event stream SSE. SSE gửi snapshot ban đầu và patch theo version/deadline; chia sẻ probe 250 ms trong từng instance, tự reconnect và fallback tuần tự khi lỗi.
- `src/components/AudioClipPlayer.tsx`, `src/lib/media.ts`: adapter audio tải lên. File gốc nằm tại `MEDIA_DIR`, ngoài thư mục public. API xác thực challenger và dùng FFmpeg để chỉ gửi đoạn từ `mediaStart` với độ dài bid; client không nhận cả bài hoặc thanh tua. Creator preview đoạn tối đa 10 giây bằng token upload.
- `src/components/ClipPlayer.tsx`: YouTube IFrame adapter. Trong lúc đoán, lớp che phủ player giữ tiêu đề và ảnh bìa khỏi màn hình; đoạn công bố đáp án hiển thị video, tự phát và dừng theo thời lượng đã lưu.
- `src/components/QuestionReview.tsx`: bản xem thử giao diện người chơi cho câu hỏi đang chỉnh sửa, gồm đấu giá, nghe, trả lời và kết quả.
- `src/components/GameRoom.tsx`: UI player/host gửi intent và render state server. Avatar được lưu bằng mã 1–20 trong bảng `players`; bốn màu nhận diện gắn với thứ tự tham gia, không đổi khi bảng điểm sắp xếp lại.

Luồng trạng thái bắt đầu bằng `TOPIC_INTRO` khi vào một chủ đề mới, rồi `OPEN_MEDIA_PLAYING → OPEN_ANSWERING → ROUND_RESULT → SCOREBOARD` cho các bài vòng 1 hoặc `BIDDING → BID_REVEAL → MEDIA_PLAYING → ANSWERING → ROUND_RESULT → SCOREBOARD` cho vòng 2. Khi nhóm đang nghe không đoán đúng và vẫn còn nhóm khác, `ANSWERING → TURN_TRANSITION → MEDIA_PLAYING`. Thời gian trả lời theo từng bài; sau kết quả và bảng điểm, hệ thống tự chuyển bài hoặc kết thúc trò chơi. Giới hạn thời gian được xử lý trên máy chủ khi có yêu cầu trạng thái hoặc sự kiện. Người tạo phòng có thể kết thúc đấu giá, bỏ qua bài và kết thúc trò chơi.

Vòng 1 có 500 điểm cơ bản mỗi câu; các đáp án đúng nhận lần lượt 100%, 75%, 50%, 25% theo thứ tự server nhận. Vòng 2 điểm cơ bản giảm khi bid nhiều giây; nhóm trùng bid chia điểm theo cùng thứ tự. Chỉ vòng 1 được thử lại sau đáp án sai; đáp án sai không chiếm thứ hạng. Mỗi vòng dùng bài hát khác nhau để tránh lộ đáp án trước khi bid.

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
- Guest token lưu localStorage; nếu xóa dữ liệu trình duyệt sẽ mất quyền host/player đang chơi. Tài khoản quiz có giới hạn thử đăng nhập nhưng chưa xác minh email, đặt lại mật khẩu, moderation, tự động rời phòng, hay xử lý YouTube lỗi theo từng player.
- Giao diện hỗ trợ sắp xếp câu hỏi bằng nút lên/xuống; chưa hỗ trợ kéo thả.

## Đoán bài hát qua gợi ý

Chọn chế độ **Đoán bài hát qua gợi ý** ở trang tạo quiz. Thêm 6 gợi ý cho mỗi bài, sửa điểm/thời gian và xem thử; có nút dùng 3 câu mẫu. Phòng bắt đầu tự động khi đủ 4 người bấm sẵn sàng. Xem [PERFORMANCE.md](PERFORMANCE.md) để biết luật, migration, số đo và cách chạy test.


### Đọ Phim

Chọn **Đọ Phim** ở mục chơi trong trang tạo quiz. Mỗi vòng chọn **Xem chung**, **Đấu giá thời gian xem** hoặc **Đoán qua 6 gợi ý**. Lưu URL YouTube, mốc bắt đầu và thời lượng như Đọ Nhạc; đáp án là tên phim. Luật điểm, thử lại, tranh quyền và chuyển vòng dùng cùng game engine. Loại quiz `FILM_DUEL` và câu hỏi `film_open`/`film_bid`/`film_clue` lưu trong các cột hiện có, không cần migration.

Đoạn phim hiện hình trong lúc phát, tự dừng đúng thời lượng. Giao diện chặn chuột/phím tua, che vùng tiêu đề và điều khiển YouTube, che toàn khung trước/sau phát hoặc khi tạm dừng. Người tạo vẫn có trình phát gốc trong editor để chọn đoạn. Đây là che trên giao diện: YouTube có thể thay đổi vị trí thông tin và nội dung tên phim nằm sẵn trong video không bị loại bỏ. Chạy rounds smoke với `SMOKE_CATEGORY=FILM` để kiểm tra 4 người qua 5 vòng phim.


## Giọng đọc WaveNet tiếng Việt

- Bật bằng `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` trong môi trường máy chủ; không đưa key vào mã nguồn hoặc biến `NEXT_PUBLIC_`.
- Bật Cloud Text-to-Speech API và billing trong Google Cloud. Tạo service account có quyền dùng API trong project đó; đặt JSON chứa `client_email` và `private_key` vào biến bí mật `GOOGLE_TTS_SERVICE_ACCOUNT_JSON` trên Vercel (Production và Preview). Không dùng key Google AI Studio.
- Giọng mặc định `vi-VN-Wavenet-A` (nữ), đổi `GOOGLE_TTS_VOICE` thành `vi-VN-Wavenet-B/C/D` nếu cần. Chỉ chấp nhận giọng WaveNet tiếng Việt để tránh chọn nhầm model có phí khác.
- Đặt `NARRATION_CACHE_SECRET` bằng chuỗi ngẫu nhiên dài và giữ ổn định khi thay thông tin xác thực Google.
- Vercel cần `BLOB_READ_WRITE_TOKEN`. Âm thanh nén và mã hóa AES-GCM trước khi lưu vào Blob; Turso chỉ lưu khóa cache, vị trí tệp và bộ đếm sử dụng, không lưu âm thanh.
- Người chơi tự nghe câu hỏi ở phần đấu giá/trả lời, gợi ý khi mở và đáp án khi công bố; không đọc đè đoạn nhạc đoán. Khi đọc đáp án trên video kết quả, âm lượng YouTube giảm còn 15% rồi trở lại.
- Có nút Nghe, Dừng và tắt/bật tự đọc cho từng thiết bị. Trình duyệt chặn tự phát thì hiện hướng dẫn bấm Nghe. Đổi câu, giành quyền trả lời hoặc tạm dừng sẽ hủy giọng cũ.
- API chỉ đọc nội dung được phép ở trạng thái phòng hiện tại; đáp án chưa công bố không được tải, kể cả đã tạo cache. Xem thử bản nháp yêu cầu đăng nhập.
- Tạo trước âm thanh câu hiện tại ở nền, dùng lại giữa các phòng có cùng nội dung. Lần đầu tạo có thể chưa kịp thời gian chơi; giọng đọc không kéo dài đồng hồ hoặc chặn trận đấu. Nên nghe thử trước khi chơi để làm ấm cache.
- `TTS_DAILY_LIMIT` mặc định 2.000 lần tạo mới/ngày (UTC); bản nháp giới hạn 50 lần mới/tài khoản/ngày. Phát lại cache không gọi Google TTS. Quota này không thay thế hạn mức/chi phí trên tài khoản Google.
- Nếu thiếu cấu hình, phần giọng đọc được ẩn và game vẫn hoạt động.
- Tài liệu API: https://cloud.google.com/text-to-speech/docs/reference/rest/v1/text/synthesize

- Giới hạn ứng dụng `TTS_MONTHLY_CHARACTER_LIMIT` mặc định 3.800.000 ký tự mới/tháng UTC; cache không tính thêm. Bộ đếm đặt chỗ trước khi gọi API (lỗi vẫn tính để giới hạn an toàn). Giới hạn này chỉ theo dõi website này, không theo dõi ứng dụng khác dùng cùng project Google. WaveNet có 4 triệu ký tự miễn phí/tháng theo bảng giá hiện tại; Google tự tính phí khi vượt quota: https://cloud.google.com/text-to-speech/pricing
