# Danh mục Đọ Phim

Phim lẻ và phim bộ được chọn trong phần tạo/chỉnh sửa quiz và màn trả lời. Tìm một phần tên Việt, tên quốc tế/tên gốc, đạo diễn hoặc diễn viên; hỗ trợ không dấu. Kết quả có năm phát hành; bộ lọc loại phim dùng trong trang tạo/chỉnh sửa. Chọn là gửi ngay. Nghe/xem chung được thử tiếp khi sai trong thời gian còn lại; đấu giá và gợi ý chỉ chốt một lần.

## Dữ liệu

Nguồn đầu tiên là [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing), metadata CC0. Collector chọn các mục thuộc cây lớp phim (`Q11424`) và phim bộ (`Q5398426`), ưu tiên số liên kết Wikipedia và bổ sung riêng các mục có quốc gia xuất xứ Việt Nam. Đây là tiêu chí độ phủ, **không phải bảng xếp hạng lượt xem/doanh thu**. Không tự dịch hoặc đoán tên Việt. Không gộp theo tên; bản làm lại khác mục Wikidata giữ mã riêng. Nếu cây lớp xếp một mục vào cả phim và phim bộ, collector ưu tiên phân loại trực tiếp P31 khi chỉ có đúng một lớp gốc rõ ràng; mục vẫn mơ hồ được loại để rà soát.

Snapshot đi kèm source để dùng ngay sau deploy, không cần API key. Tìm kiếm chạy trong bộ nhớ của trình duyệt sau khi tải các trang danh mục; không gọi Wikidata khi người chơi gõ. Có thể xuất bản snapshot vào Turso bằng công cụ import; máy chủ ưu tiên phiên bản đang hoạt động trong database, sau đó mới dùng bản đi kèm source. Danh mục chưa bao quát mọi phim, tên dịch hoặc diễn viên.

```powershell
python scripts/collect-film-catalog.py --refresh --recent-since 2026-01-01
node --experimental-strip-types scripts/import-film-library.mjs --dry-run
# Thiết lập TURSO_DATABASE_URL và TURSO_AUTH_TOKEN trong môi trường máy chạy:
node --experimental-strip-types scripts/import-film-library.mjs
# Chỉ để kiểm tra database local:
node --experimental-strip-types scripts/import-film-library.mjs --local
```

Dùng `--refresh` để lấy lại phản hồi Wikidata thay vì dùng cache từ lần trước. Khi cần tiếp tục lần lấy mới bị gián đoạn, dùng `--refresh-since` với thời điểm bắt đầu có múi giờ (ví dụ `2026-10-29T04:33:00Z`); cache cũ hơn mốc đó sẽ bị bỏ qua. Tối đa hai truy vấn metadata chạy đồng thời, các lần bắt đầu yêu cầu vẫn cách nhau ít nhất hai giây. `--recent-since YYYY-MM-DD` bổ sung phim có ngày phát hành (P577) hoặc phim bộ có ngày bắt đầu (P580) từ mốc đó đến lúc truy vấn, tối đa `--recent-limit` (mặc định 2.000) mỗi loại. Phim chỉ có dữ liệu năm, chưa có ngày hợp lệ hoặc chưa có liên kết Wikipedia có thể không thuộc nhóm bổ sung này. Mã phim cũ vẫn được giữ và được lấy lại metadata dù không còn trong nhóm chọn lọc hôm nay.

Collector cache các phản hồi để tiếp tục khi gián đoạn nếu không dùng `--refresh`; chỉ ghi snapshot cuối và manifest checksum `catalog-manifests/films.json` khi hoàn tất. Import đọc lại checksum trước khi đổi phiên bản đang hoạt động, kiểm tra xung đột với lần import khác và từ chối snapshot làm mất mã phim cũ. Collector tự gộp dữ liệu cũ vào snapshot mới; báo cáo `refreshedCount` và `retainedCount` phân biệt mục lấy lại được với mục chỉ giữ nguyên. `complete` chỉ nghĩa là lần thu thập đã hoàn tất, không bảo đảm đã có mọi phim tính đến `retrievedAt`.

## Định danh và quyền truy cập

UUID nội bộ được sinh ổn định từ Wikidata QID trong namespace riêng của phim. Token có chữ ký HMAC và trường `category: FILM`; token nhạc không dùng được cho phim và ngược lại. Quiz lưu `film_catalog_id`, tách khỏi `musicbrainz_work_id`. API xác định loại quiz phía máy chủ; người chơi không tự khai loại đáp án để chấm. Người tạo cần đăng nhập; người chơi cần token hợp lệ của phòng Đọ Phim có kiểu trả lời tìm kiếm. Danh mục chỉ chứa metadata chung, không có danh sách đáp án riêng của quiz.

Lời hướng dẫn AI và phần chơi thử dùng cùng luồng chọn phim. Danh mục không cung cấp đoạn video: người tạo vẫn chọn link YouTube, mốc bắt đầu và độ dài đoạn phim như trước. Không lưu phim, poster hoặc nội dung tóm tắt có bản quyền trong snapshot này.

## Nguồn đã khảo sát

- [Wikidata: Data access](https://www.wikidata.org/wiki/Wikidata:Data_access): dùng snapshot để tránh truy vấn dịch vụ công cộng trong lúc chơi.
- [TMDB FAQ](https://developer.themoviedb.org/docs/faq): API có tên bản địa, phim và TV; cần key, ghi nguồn/logo theo điều khoản. Chưa tích hợp vào bản này.
- [TMDB Daily ID exports](https://developer.themoviedb.org/docs/daily-id-exports): chỉ là danh sách ID và một số thuộc tính, không phải bản xuất toàn bộ metadata.

## Bản cập nhật ngày 29/10/2026

Lấy lại từ Wikidata lúc **11:44 ngày 29/10/2026 (giờ Việt Nam)**: **9.931 mục**, gồm **7.067 phim lẻ**, **2.864 phim bộ**, trong đó **497 mục có quốc gia xuất xứ Việt Nam**. Thêm **2.439 mục** so với snapshot ngày 28/10/2026; giữ đủ **7.492 mã phim cũ** và lấy lại được metadata cho cả 9.931 mục.

Ngoài các nhóm chọn lọc trước đây, lần này bổ sung tối đa 2.000 mục mỗi loại có ngày phát hành/phát sóng từ 01/01/2026 đến lúc truy vấn. Nhóm phim lẻ chạm giới hạn này; không coi snapshot là toàn bộ phim đã phát hành đến ngày cập nhật. Phim Việt có thể trùng nhóm gần đây/phổ biến nên không cộng riêng vào tổng.

Snapshot được lưu trong repo; database production có phiên bản đang hoạt động cần được import riêng bằng lệnh ở trên. Không đổi kết nối hoặc dữ liệu phòng chơi khi cập nhật snapshot.

## Mở rộng độ phủ tên phim tiếng Việt

Không chỉ tăng giới hạn nhóm phổ biến: dùng các bài phim/phim bộ trên Wikipedia tiếng Việt làm một nhóm tuyển chọn độc lập, không áp dụng ngưỡng số liên kết Wikipedia hoặc điều kiện quốc gia xuất xứ Việt Nam. Vì vậy nhóm này bao gồm cả phim Hàn, Trung, Nhật, Mỹ… có bài tiếng Việt, cũng như phim Việt thiếu thuộc tính quốc gia trên Wikidata.

```powershell
python scripts/collect-film-catalog.py --refresh --vietnamese-wikipedia-limit 15000 --only-new
```

`--only-new` chỉ lấy metadata đầy đủ của mã chưa có; metadata cũ được giữ, còn tên bài tiếng Việt được gộp thêm vào aliases để tìm kiếm. Với phim mới chưa có nhãn vi trên Wikidata, tên bài tiếng Việt đã xác minh có thể làm tên hiển thị. Giữ nguyên UUID theo Wikidata QID, không gộp hai phim chỉ vì trùng tên. Trường `metadataMode`, `previousSnapshotAt`, `refreshedCount`, `retainedCount` và `vietnameseAliasUpdates` trong manifest phân biệt dữ liệu bổ sung với dữ liệu đã có; ngày bổ sung không có nghĩa là lấy lại metadata của mọi mục cũ.

Đây vẫn chưa phải kho phim toàn diện: phim không có mục Wikidata/bài Wikipedia tiếng Việt hoặc được phân loại ngoài cây lớp phim/phim bộ có thể chưa được lấy. Cần kiểm tra tên phim cụ thể để phân biệt thiếu mục, thiếu tên gọi hoặc website còn dùng phiên bản database cũ.

Lần mở rộng ngày 29/10/2026: **14,762 mục** (thêm **4.831** so với bản 9.931 mục), giữ toàn bộ mã cũ; bổ sung tên bài tiếng Việt vào **2.299 mục**.

Lần đối chiếu phân loại trực tiếp khôi phục thêm 7 mục, gồm **Cô nàng ngổ ngáo** (Q483166, phim lẻ). Chỉ dùng khai báo P31 trực tiếp với đúng một lớp gốc; không suy đoán loại theo tên bài hoặc năm.

### Đối chiếu danh sách phim yêu cầu

Bản mở rộng cuối có **14.822 mục** (9.708 phim lẻ và 5.114 phim bộ). Bổ sung riêng danh sách QID đã đối chiếu tên, năm/đạo diễn trong `catalog-seed/film-coverage.json`, và thu thập credit diễn viên/đạo diễn cho **Sydney Sweeney (Q49561909)** và **Châu Tinh Trì / Stephen Chow (Q311179)**. Không nhầm với người trùng tên Stephen Chow mang QID khác. Snapshot hiện có 22 tác phẩm với credit Sydney Sweeney và 49 với credit Stephen Chow; đây là độ phủ credit Wikidata, không phải cam kết filmography đầy đủ ngoài nguồn này.

```powershell
python scripts/collect-film-catalog.py --refresh --vietnamese-wikipedia-limit 15000 --only-new --coverage-file catalog-seed/film-coverage.json
```

`--coverage-file` nhận QID phim và người đã xác minh, chỉ bổ sung tác phẩm thuộc lớp phim/phim bộ. Dù dùng `--only-new`, các mục được yêu cầu cụ thể vẫn lấy lại metadata; aliases cũ được giữ. Các `searchAliases` là tên tìm kiếm do người dùng dự án cung cấp (ví dụ “Cá lạnh”, “Tình yêu tội lỗi”, “Kẻ dòm ngó”), không được khẳng định là tên phát hành chính thức. Không thêm các mô tả đùa của người dùng thành tên phim chính thức. Mã phim không thay đổi.

Danh sách kiểm tra bao gồm Cold Fish, Love Exposure, Secretary, The Voyeurs, Raw, Ichi the Killer, The Ugly Stepsister, Black Phone 1–2, Terrifier 1–3, các phim Saw, The Guest (2014), Demon City (2025), Nguyên tội của Takopi (anime), Chơi ngải 1–3, Trường học Uy Long 1–3 và Đổ thánh 1–3. Với phim có nhiều bản, kiểm tra theo QID, không gộp theo tên. “Trai bao” tìm được các bản Hollywood riêng biệt: American Gigolo (1980, Richard Gere), Deuce Bigalow: Male Gigolo (1999, Rob Schneider) và Midnight Cowboy (1969, Jon Voight); không gộp chúng thành một phim; Kingdom và Hello Ghost có nhiều bản khác nhau, bộ kiểm tra hiện đối chiếu Kingdom (series 2019) và Hello Ghost (phim Hàn 2010).

Giao diện tìm phim có nút **Xem thêm phim** khi vượt 30 kết quả, giữ quy tắc chọn là gửi ngay; tìm theo diễn viên không còn bị giới hạn ở 30 mục đầu mà không có cách xem tiếp.
