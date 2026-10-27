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
