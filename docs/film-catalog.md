# Danh mục Đọ Phim

Phim lẻ và phim bộ được chọn trong phần tạo/chỉnh sửa quiz và màn trả lời. Tìm một phần tên Việt, tên quốc tế/tên gốc, đạo diễn hoặc diễn viên; hỗ trợ không dấu. Kết quả có loại phim và năm phát hành. Chọn là gửi ngay. Nghe/xem chung được thử tiếp khi sai trong thời gian còn lại; đấu giá và gợi ý chỉ chốt một lần.

## Dữ liệu

Nguồn đầu tiên là [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing), metadata CC0. Collector chọn các mục thuộc cây lớp phim (`Q11424`) và phim bộ (`Q5398426`), ưu tiên số liên kết Wikipedia và bổ sung riêng các mục có quốc gia xuất xứ Việt Nam. Đây là tiêu chí độ phủ, **không phải bảng xếp hạng lượt xem/doanh thu**. Không tự dịch hoặc đoán tên Việt. Không gộp theo tên; bản làm lại khác mục Wikidata giữ mã riêng. Mục bị phân loại đồng thời là phim và phim bộ được loại để rà soát.

Snapshot đi kèm source để dùng ngay sau deploy, không cần API key. Tìm kiếm chạy trong bộ nhớ của trình duyệt sau khi tải các trang danh mục; không gọi Wikidata khi người chơi gõ. Có thể xuất bản snapshot vào Turso bằng công cụ import; máy chủ ưu tiên phiên bản đang hoạt động trong database, sau đó mới dùng bản đi kèm source. Danh mục chưa bao quát mọi phim, tên dịch hoặc diễn viên.

```powershell
python scripts/collect-film-catalog.py
node --experimental-strip-types scripts/import-film-library.mjs --dry-run
# Thiết lập TURSO_DATABASE_URL và TURSO_AUTH_TOKEN trong môi trường máy chạy:
node --experimental-strip-types scripts/import-film-library.mjs
# Chỉ để kiểm tra database local:
node --experimental-strip-types scripts/import-film-library.mjs --local
```

Collector cache các phản hồi để tiếp tục khi gián đoạn; chỉ ghi snapshot cuối khi hoàn tất. Import đọc lại checksum trước khi đổi phiên bản đang hoạt động, kiểm tra xung đột với lần import khác và từ chối snapshot làm mất mã phim cũ. Các lần bổ sung sau phải gộp dữ liệu cũ vào snapshot mới.

## Định danh và quyền truy cập

UUID nội bộ được sinh ổn định từ Wikidata QID trong namespace riêng của phim. Token có chữ ký HMAC và trường `category: FILM`; token nhạc không dùng được cho phim và ngược lại. Quiz lưu `film_catalog_id`, tách khỏi `musicbrainz_work_id`. API xác định loại quiz phía máy chủ; người chơi không tự khai loại đáp án để chấm. Người tạo cần đăng nhập; người chơi cần token hợp lệ của phòng Đọ Phim có kiểu trả lời tìm kiếm. Danh mục chỉ chứa metadata chung, không có danh sách đáp án riêng của quiz.

Lời hướng dẫn AI và phần chơi thử dùng cùng luồng chọn phim. Danh mục không cung cấp đoạn video: người tạo vẫn chọn link YouTube, mốc bắt đầu và độ dài đoạn phim như trước. Không lưu phim, poster hoặc nội dung tóm tắt có bản quyền trong snapshot này.

## Nguồn đã khảo sát

- [Wikidata: Data access](https://www.wikidata.org/wiki/Wikidata:Data_access): dùng snapshot để tránh truy vấn dịch vụ công cộng trong lúc chơi.
- [TMDB FAQ](https://developer.themoviedb.org/docs/faq): API có tên bản địa, phim và TV; cần key, ghi nguồn/logo theo điều khoản. Chưa tích hợp vào bản này.
- [TMDB Daily ID exports](https://developer.themoviedb.org/docs/daily-id-exports): chỉ là danh sách ID và một số thuộc tính, không phải bản xuất toàn bộ metadata.
