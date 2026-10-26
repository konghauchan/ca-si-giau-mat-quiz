# Tìm tên bài hát qua MusicBrainz

## Cách dùng

1. Tạo/chỉnh sửa Đọ Nhạc, chọn **Phạm vi tìm bài hát** cho cả quiz:
   - **Nhạc Việt**: tác phẩm có ngôn ngữ lời `vie`.
   - **US–UK**: tiếng Anh quốc tế (`eng`), gồm cả nghệ sĩ Canada, Úc…; loại tác phẩm đồng thời được gắn `vie` để không trộn nhạc Việt vào nhóm này.
2. Trong vòng chơi, chọn cách trả lời **Tìm tên bài hát · MusicBrainz**.
3. Ở từng câu, chọn đáp án từ MusicBrainz. Đáp án chính được điền từ kết quả; nghệ sĩ biểu diễn vẫn nhập riêng. Tên tác giả của tác phẩm không được dùng thay tên ca sĩ.
4. Người chơi gõ tên bài hoặc ca sĩ với ít nhất hai ký tự. Bấm vào bài, hoặc dùng mũi tên rồi Enter, sẽ gửi đáp án ngay. Phần tạo quiz chỉ liên kết đáp án, không tự lưu quiz.

Nghe chung được thử tiếp sau khi sai; đấu giá và giành quyền qua gợi ý chỉ có một lượt. ABCD và kiểu gõ đáp án vẫn dùng luật hiện có. MusicBrainz cung cấp metadata, YouTube vẫn phát nhạc.

## Phân loại và chấm đáp án

- Dùng MusicBrainz **Work**, vì trường `lang` mô tả ngôn ngữ lời bài hát. `Recording.country` là quốc gia phát hành, không xác định ngôn ngữ hay thể loại nhạc.
- Không tự đoán ngôn ngữ theo tên bài/quốc tịch ca sĩ. Bài chưa có metadata ngôn ngữ sẽ không xuất hiện. Nếu thiếu bài, giữ cách gõ đáp án hoặc ABCD cho vòng đó.
- Chấm theo MBID tác phẩm được người tạo chọn; các bản biểu diễn chung tác phẩm có thể được chấp nhận. Tác phẩm khác trùng tên là đáp án khác. Cần chọn đúng mục/tác giả khi MusicBrainz có dữ liệu trùng hoặc nhiều phiên bản.
- Đổi phạm vi quiz sẽ yêu cầu liên kết lại đáp án. Lỗi lưu đưa tới đúng câu và ô chọn MusicBrainz.
- Máy chủ ký lựa chọn để chống sửa tên, mã bài hoặc phạm vi từ trình duyệt. Không gửi MBID đáp án đúng cho người chơi trước kết quả. Việc chấm không gọi MusicBrainz.

## Tải và giới hạn

- Lọc danh mục đã tải ngay khi gõ; chỉ chờ 300 ms khi cần tìm bài chưa có; lọc theo từ khóa mới khi lượt tìm đang chạy hoàn tất; hủy yêu cầu khi đổi phạm vi/phòng hoặc rời giao diện.
- Bộ nhớ đệm theo `(phạm vi, từ khóa)` lưu trong Turso, dùng chung nhiều Vercel instances. Kết quả có bài giữ 7 ngày; không có bài giữ 1 giờ. Danh mục metadata công khai giữ tối đa 30 ngày, không thu thập đáp án từ quiz riêng tư.
- Gộp các truy vấn trùng đang chạy; lease trong database giới hạn toàn ứng dụng, bảo đảm các lần gọi MusicBrainz cách nhau hơn một giây. Lease tự hết hạn khi instance dừng.
- Khi nhiều từ khóa mới cùng lúc, trả dữ liệu có sẵn hoặc HTTP 202 với thời gian chờ; trình duyệt tự thử tiếp có giới hạn và vẫn cho nhập. **30 kết quả từ cache đã được kiểm tra; không cam kết 30 truy vấn mới/giây qua API công cộng.** Muốn phục vụ tải tìm kiếm lớn liên tục cần danh mục/chỉ mục MusicBrainz tự vận hành hoặc thỏa thuận dịch vụ phù hợp.
- Không cần API key MusicBrainz. Migration thêm bảng/cột khi server truy cập database; khóa ký được tạo ngẫu nhiên và chỉ lưu phía máy chủ trong database.

## Kiểm tra

- `node --experimental-strip-types --test --test-isolation=none tests/music-search.test.ts`
- Khởi động server với database thử nghiệm, sau đó đặt cùng `DATABASE_PATH` chứa `rounds-smoke` và chạy `node tests/music-search-smoke.mjs`. Script từ chối chạy với Turso/URL ngoài localhost.

## Tài liệu

- [MusicBrainz search: Work.lang và Recording.country](https://musicbrainz.org/doc/MusicBrainz_API/Search)
- [Rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)

## Tìm theo ca sĩ

- Tìm trong Recording theo tên bài hoặc artist-credit/artistname, rồi lấy các Work liên kết với bản thu để kiểm tra ngôn ngữ. Tìm nghệ sĩ trước nếu có từ 3 ký tự, sau đó Recording và Work. Mỗi bước có cache riêng dùng chung; chỉ gọi MusicBrainz khi bước đó chưa có dữ liệu, cách nhau hơn một giây.
- Ca sĩ lấy từ artist-credit của bản thu, không suy từ tên người sáng tác của Work. Một tác phẩm chỉ hiển thị nhóm ca sĩ của một bản thu phù hợp, tránh gộp các bản cover. Thiếu thông tin sẽ ghi “Chưa có thông tin ca sĩ”.
- Khi chỉ có một ca sĩ được xác định, phần tạo quiz điền tên đó vào trường nghệ sĩ để người tạo kiểm tra với video YouTube.
- Mã chấm vẫn là Work MBID nên các quiz đã lưu không phải liên kết lại.
- Cache/catalog mới dùng namespace artist-prefix-v3, không tái sử dụng kết quả cũ thiếu ca sĩ. Chỉ mục metadata công khai gồm tên bài và ca sĩ; giữ nguyên bộ lọc ngôn ngữ và giới hạn API.

## Tìm nhanh và gửi ngay khi chọn

- Tải trước tối đa 5.000 mục (giới hạn phản hồi 3 MB) metadata công khai đúng phạm vi từ Turso khi vào vòng có SEARCH (kể cả lobby/intro/nghe). Danh mục được chuẩn hóa và sắp xếp một lần trên thiết bị; gõ tiếp chỉ quét chỉ mục và lấy tối đa 20 kết quả.
- Snapshot metadata dùng chung trong server 30 giây, gộp các lượt tải cùng lúc; trình duyệt tái sử dụng 5 phút. Mỗi lần tìm ngoài bổ sung kết quả vào chỉ mục thiết bị. Không gửi danh sách câu/đáp án riêng của quiz; endpoint catalog không truy vấn nội dung quiz để tạo kết quả.
- Server trả metadata có sẵn ngay cả khi ít hơn 20 kết quả. Nút “Tìm thêm trên MusicBrainz” cho tìm bổ sung; từ khóa chưa có vẫn cần API bên ngoài và có thể chậm/bận.
- Chọn bằng chuột hoặc Enter gửi đúng lựa chọn ngay, khóa tức thì để chặn double click. Luật và thời hạn vẫn do server quyết định. Gửi thất bại cho thử lại; nghe chung sai vẫn được nhập tiếp, đấu giá và gợi ý giữ một lần theo luật.
- Tốc độ gần tức thì áp dụng cho dữ liệu đã tải, không phải toàn bộ thư viện MusicBrainz. Không đổi mốc tính điểm sang đồng hồ máy người chơi.


## Tìm tên nhập dở (artist-prefix-v3)

- Chỉ cần một phần tên bài/ca sĩ, ví dụ `backstreet`, `backst`, `backstreet’s boy`, `back street`. Chuẩn hóa riêng cho tìm kiếm; không đổi luật chấm đáp án.
- Khi cần dữ liệu mới: tìm nghệ sĩ theo tên/alias → lấy tối đa 100 bản thu bằng MBID nghệ sĩ → tìm Work từ các mã bản thu, vẫn lọc theo ngôn ngữ lời. Nếu không nhận diện được nghệ sĩ thì tìm bản thu theo tên bài/ca sĩ như thường.
- Trả tối đa 20 tác phẩm khác nhau để cuộn chọn; không yêu cầu gõ đủ 100% tên. Hiển thị credit của một bản thu phù hợp; không nối ca sĩ của nhiều bản cover thành một nhóm. Credit song ca thực sự vẫn giữ các ca sĩ trong cùng bản thu.
- Query cache dùng namespace shared-metadata-v4 để bỏ qua kết quả rỗng cũ; giữ catalog artist-prefix-v3 đã tích lũy. Khóa chung chỉ giữ một HTTP request, tối đa 10 giây (timeout 7 giây). Nếu 429/503 thì cùng chờ 5 giây trước khi thử tiếp, không cache lỗi thành danh sách rỗng. Không vượt giới hạn một request/giây của dịch vụ.
- Danh mục đã tải lọc ngay trên máy; lần tìm nghệ sĩ mới vẫn phụ thuộc độ trễ/khả dụng và độ đầy đủ metadata MusicBrainz. Không cam kết truy vấn lạnh tức thì.
- Fixture công khai `tests/fixtures/backstreet-search.json` giữ metadata thực đã lấy ngày 26/10/2026 để kiểm tra đúng trường hợp Backstreet; không cần gọi dịch vụ công cộng khi chạy unit test.

- Khi đang gõ, giữ tối đa một lượt tìm ngoài đang chạy trong component. Kết quả cũ chỉ bổ sung chỉ mục cùng phạm vi; từ khóa hiện tại quyết định danh sách hiển thị. Không gọi lại API cho từng ký tự và không hiển thị dữ liệu của phòng/phạm vi cũ.


## Không báo bận giả khi đang trả lời

- Tách trạng thái chờ provider (202 / MUSIC_SEARCH_PENDING) khỏi vượt số lượt tìm của một người (429). Client tự cập nhật theo retryAfter, tối đa khoảng 20 giây, dừng khi hết lượt/đổi phòng/phạm vi/unmount. Không cộng thêm thời gian chơi và không gửi đáp án khi mới tìm.
- Artist, Recording và Work có cache metadata công khai từng bước 24 giờ (rỗng 1 giờ), dùng chung Turso/Vercel. Người chờ tiếp tục từ bước chưa hoàn tất, không lặp lại cả chuỗi. Chỉ lưu trường cần cho tìm và lọc ngôn ngữ, không lưu payload bản phát hành thừa.
- Danh mục khởi đầu công khai gồm 60 tác phẩm của Justin Bieber, Rihanna, Backstreet Boys, lấy từ MusicBrainz ngày 26/10/2026. Metadata đóng gói cùng server, thêm vào catalog được ký/tải từ lobby; không lấy nội dung từ quiz riêng tư, không chứa token ký sẵn và không gọi provider cho các mục đã có.
- Tên nghệ sĩ tìm gần đúng một chữ: rihana → Rihanna. Tìm theo tên/alias MusicBrainz và lọc gần đúng trong danh mục đã tải; không hardcode tên sai thành mã nghệ sĩ.
- Bài mới ngoài danh mục vẫn phụ thuộc API MusicBrainz. 30 tên hoàn toàn mới cùng lúc không thể được bảo đảm tức thì bằng API công cộng; cần tiếp tục mở rộng catalog/chỉ mục riêng cho quy mô đó.
- Regression gồm khóa provider bị giữ, 503/timeout, chia sẻ một bước metadata cho 30 client, tự cập nhật và hủy polling; API kiểm tra 30 người trong phòng US–UK tìm Justin Bieber/rihana và gửi lựa chọn khi provider đang bị khóa.
