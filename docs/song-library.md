# Danh mục bài hát trên Turso

Danh mục công khai 20.000 tác phẩm MusicBrainz được lưu lâu dài trong `song_library_entries`. Không lưu MP3, video, lời bài hát hoặc đáp án riêng của quiz.

`song_library_releases` lưu nguồn dữ liệu, số bài, checksum và ngày hoàn tất. `song_library_active` trỏ đến bản đã kiểm tra đầy đủ. Khi có bản đang hoạt động, tìm kiếm và tải danh mục dùng dữ liệu Turso. JSON đi kèm mã nguồn chỉ là nguồn nhập và phương án khởi tạo khi chưa có bản nào trong database.

## Nhập hoặc cập nhật

Chạy từ thư mục dự án với Node 24, đã cài dependency. Tệp kết nối phải chứa `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` của đúng database, được gitignore. Không đưa khóa lên GitHub hoặc dán vào tham số lệnh.

```powershell
# Kiểm tra dữ liệu đầu vào, không kết nối database
npm run import-catalog -- --dry-run

# Thử trên SQLite riêng trước
npm run import-catalog -- --local

# Nhập vào Turso bằng thông tin kết nối có sẵn
node --env-file=.env.local --experimental-strip-types scripts/import-song-library.mjs

# Đọc lại toàn bộ dữ liệu và so checksum, không ghi
node --env-file=.env.local --experimental-strip-types scripts/import-song-library.mjs --verify
```

Mỗi lô chỉ 100 bài, tránh giữ khóa ghi xuyên suốt quá trình nhập. Có thể chạy lại sau lỗi: upsert theo phiên bản, phạm vi và mã tác phẩm không tạo dòng trùng. Chỉ đổi phiên bản hoạt động sau khi đọc lại đủ số bài và kiểm tra checksum. Chạy lại bản cũ đã hoàn tất không tự quay lùi bản mới. Không xóa bản trước, không thay đổi tài khoản, quiz hay phòng chơi.

Quy trình cập nhật: xuất lại JSON bằng công cụ thu thập, kiểm tra nguồn/ngôn ngữ, chạy thử, nhập Turso, xác minh. Cache danh mục trên server làm mới trong khoảng 30 giây; browser đang mở tải lại danh mục theo TTL tối đa 5 phút hoặc khi tải lại trang. Các bảng `music_catalog` và `music_search_cache` vẫn là cache tạm; việc dọn cache không xóa danh mục lâu dài.

Lưu ý: 20.000 bài gồm danh mục có ngôn ngữ rõ ràng, ưu tiên bảng xếp hạng cộng đồng ListenBrainz và độ phủ bản thu MusicBrainz; không phải bảng xếp hạng 20.000 bài có lượt nghe cao nhất toàn cầu.

## Bổ sung danh mục theo nghệ sĩ

`scripts/artist-catalog-roster.json` là danh sách biên tập các nghệ sĩ nổi bật thập niên 1980/1990/2000, gồm cả nghệ sĩ Canada/Úc... Mốc thập niên dùng để nhóm nghệ sĩ; không giới hạn năm phát hành của bài hát. Có thể thêm tên hoặc khai báo `name`, `country`, `type` để phân biệt nghệ sĩ trùng tên.

```powershell
python scripts/collect-artist-catalog.py
node --env-file=.env.local --experimental-strip-types scripts/import-song-library.mjs --append --input=data/artist-catalog/expansion.json --snapshot=data/artist-catalog/merged-library.json
node --env-file=.env.local --experimental-strip-types scripts/import-song-library.mjs --verify --input=data/artist-catalog/merged-library.json
```

Công cụ duyệt tất cả trang bản thu của từng nghệ sĩ, kiểm tra mã nghệ sĩ trong credit, liên kết tác phẩm Song và ngôn ngữ tiếng Anh rõ ràng. Dùng tối đa 4 kết nối đang chờ nhưng có một cổng tốc độ chung: các lần bắt đầu request cách nhau ít nhất 1,2 giây; gặp 503/429 sẽ backoff. Checkpoint/cache cho phép chạy tiếp. Bản thiếu ngôn ngữ hoặc liên kết tác phẩm được thống kê trong `source.artistReports`, không tạo mã giả hay cam kết bao phủ bài chưa có trên MusicBrainz.

Các bản cover cùng tác phẩm vẫn một Work ID. Giữ credit hiển thị hiện có, thêm nghệ sĩ của bản thu khác vào tên có thể tìm kiếm và lưu bằng chứng `source.performerCredits`; không ghép các ca sĩ của hai bản cover thành một bản song ca.

`--append` đọc và xác minh danh mục Turso đang hoạt động, gộp tác phẩm mới, giữ toàn bộ bài cũ và chỉ kích hoạt nếu phiên bản gốc chưa đổi trong lúc nhập. Không lấy JSON 20.000 bài cũ để thay thế danh mục online. Tệp snapshot chứa metadata công khai để đọc lại checksum sau nhập; không chứa khóa. Tổng dung lượng danh mục tối đa hiện tại là 100.000 tác phẩm, phân trang 4.000 bài mỗi request.
