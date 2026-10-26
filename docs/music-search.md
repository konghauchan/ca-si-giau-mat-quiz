# Tìm tên bài hát qua MusicBrainz

## Cách dùng

1. Tạo/chỉnh sửa Đọ Nhạc, chọn **Phạm vi tìm bài hát** cho cả quiz:
   - **Nhạc Việt**: tác phẩm có ngôn ngữ lời `vie`.
   - **US–UK**: tiếng Anh quốc tế (`eng`), gồm cả nghệ sĩ Canada, Úc…; loại tác phẩm đồng thời được gắn `vie` để không trộn nhạc Việt vào nhóm này.
2. Trong vòng chơi, chọn cách trả lời **Tìm tên bài hát · MusicBrainz**.
3. Ở từng câu, chọn đáp án từ MusicBrainz. Đáp án chính được điền từ kết quả; nghệ sĩ biểu diễn vẫn nhập riêng. Tên tác giả của tác phẩm không được dùng thay tên ca sĩ.
4. Người chơi gõ tên bài hoặc ca sĩ với ít nhất hai ký tự, chọn kết quả rồi chốt. Chọn kết quả chưa gửi đáp án.

Nghe chung được thử tiếp sau khi sai; đấu giá và giành quyền qua gợi ý chỉ có một lượt. ABCD và kiểu gõ đáp án vẫn dùng luật hiện có. MusicBrainz cung cấp metadata, YouTube vẫn phát nhạc.

## Phân loại và chấm đáp án

- Dùng MusicBrainz **Work**, vì trường `lang` mô tả ngôn ngữ lời bài hát. `Recording.country` là quốc gia phát hành, không xác định ngôn ngữ hay thể loại nhạc.
- Không tự đoán ngôn ngữ theo tên bài/quốc tịch ca sĩ. Bài chưa có metadata ngôn ngữ sẽ không xuất hiện. Nếu thiếu bài, giữ cách gõ đáp án hoặc ABCD cho vòng đó.
- Chấm theo MBID tác phẩm được người tạo chọn; các bản biểu diễn chung tác phẩm có thể được chấp nhận. Tác phẩm khác trùng tên là đáp án khác. Cần chọn đúng mục/tác giả khi MusicBrainz có dữ liệu trùng hoặc nhiều phiên bản.
- Đổi phạm vi quiz sẽ yêu cầu liên kết lại đáp án. Lỗi lưu đưa tới đúng câu và ô chọn MusicBrainz.
- Máy chủ ký lựa chọn để chống sửa tên, mã bài hoặc phạm vi từ trình duyệt. Không gửi MBID đáp án đúng cho người chơi trước kết quả. Việc chấm không gọi MusicBrainz.

## Tải và giới hạn

- Chờ người chơi ngừng gõ 500 ms trước khi tìm; hủy kết quả cũ khi đổi từ khóa/phạm vi hoặc hết lượt.
- Bộ nhớ đệm theo `(phạm vi, từ khóa)` lưu trong Turso, dùng chung nhiều Vercel instances. Kết quả có bài giữ 7 ngày; không có bài giữ 1 giờ. Danh mục metadata công khai giữ tối đa 30 ngày, không thu thập đáp án từ quiz riêng tư.
- Gộp các truy vấn trùng đang chạy; lease trong database giới hạn toàn ứng dụng, bảo đảm các lần gọi MusicBrainz cách nhau hơn một giây. Lease tự hết hạn khi instance dừng.
- Khi nhiều từ khóa mới cùng lúc, trả dữ liệu có sẵn hoặc thông báo bận và nút tìm lại. **30 kết quả từ cache đã được kiểm tra; không cam kết 30 truy vấn mới/giây qua API công cộng.** Muốn phục vụ tải tìm kiếm lớn liên tục cần danh mục/chỉ mục MusicBrainz tự vận hành hoặc thỏa thuận dịch vụ phù hợp.
- Không cần API key MusicBrainz. Migration thêm bảng/cột khi server truy cập database; khóa ký được tạo ngẫu nhiên và chỉ lưu phía máy chủ trong database.

## Kiểm tra

- `node --experimental-strip-types --test --test-isolation=none tests/music-search.test.ts`
- Khởi động server với database thử nghiệm, sau đó đặt cùng `DATABASE_PATH` chứa `rounds-smoke` và chạy `node tests/music-search-smoke.mjs`. Script từ chối chạy với Turso/URL ngoài localhost.

## Tài liệu

- [MusicBrainz search: Work.lang và Recording.country](https://musicbrainz.org/doc/MusicBrainz_API/Search)
- [Rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)

## Tìm theo ca sĩ

- Tìm trong Recording theo tên bài hoặc artist-credit/artistname, rồi lấy các Work liên kết với bản thu để kiểm tra ngôn ngữ. Mỗi truy vấn chưa có cache dùng tối đa hai lần gọi MusicBrainz, cách nhau hơn một giây.
- Ca sĩ lấy từ artist-credit của bản thu, không suy từ tên người sáng tác của Work. Một tác phẩm có thể hiển thị nhiều ca sĩ từ các bản thu liên kết. Thiếu thông tin sẽ ghi “Chưa có thông tin ca sĩ”.
- Khi chỉ có một ca sĩ được xác định, phần tạo quiz điền tên đó vào trường nghệ sĩ để người tạo kiểm tra với video YouTube.
- Mã chấm vẫn là Work MBID nên các quiz đã lưu không phải liên kết lại.
- Cache/catalog mới dùng namespace performers-v2, không tái sử dụng kết quả cũ thiếu ca sĩ. Chỉ mục metadata công khai gồm tên bài và ca sĩ; giữ nguyên bộ lọc ngôn ngữ và giới hạn API.
