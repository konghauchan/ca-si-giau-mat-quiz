# Danh mục bài hát trên Turso

## Danh mục nhiều nguồn (28/10/2026)

Danh mục Đọ Nhạc dùng mã nội bộ ổn định, không bắt buộc mọi bài phải có Work ID MusicBrainz. Giữ nguyên mọi mã cũ; bài Wikidata chưa có Work ID dùng UUID v5 theo QID, với `source.workId=null`. Không đưa UUID nội bộ lên MusicBrainz hay giả định đó là Work ID. Token lựa chọn và chấm đáp án dùng cùng mã danh mục ở cả phía tạo câu hỏi và người chơi; tên cột cũ `musicbrainz_work_id` được giữ để tương thích dữ liệu.

Nguồn bổ sung là [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access), dữ liệu có cấu trúc [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing). Nghệ sĩ được nối bằng MBID, hoặc bằng liên kết Wikidata trên hồ sơ nghệ sĩ MusicBrainz đã xác minh. Chỉ lấy item bài hát/đĩa đơn có credit nghệ sĩ được nối; tải hết trang kết quả và giữ bằng chứng nguồn.

Chính sách US–UK đã được người dùng chọn: nhận bài chưa rõ ngôn ngữ của nghệ sĩ đã xác minh; loại bài được xác nhận không có tiếng Anh. Không gán `eng` cho trường trống. `source.languageStatus`, `scopePolicy` và bằng chứng giữ rõ trạng thái này. Nguồn đã xác nhận tiếng Việt không được thêm vào US–UK. Bộ lọc MusicBrainz trực tiếp vẫn thận trọng với nghệ sĩ ngoài roster; chính sách mới được áp dụng khi nhập roster đã xác minh.

Nếu có Work ID rõ ràng, giữ ID đó. Nếu item chưa có Work ID nhưng trùng tên/nghệ sĩ với bài đã lưu hoặc vừa khôi phục, ghi ứng viên vào `review.json`, không tự suy ra hai tác phẩm là một và không tạo thêm hàng trùng. Hai Work ID khác nhau vẫn được phân biệt dù trùng tên. Credit của bản cover bổ sung thành alias có bằng chứng; không ghép thành song ca giả.

Quy trình cập nhật dùng snapshot của bản Turso hiện hành để tránh lấy danh mục cũ làm chuẩn chống trùng:

```powershell
node --env-file=<connection.env> --experimental-strip-types scripts/export-song-library.mjs --output=data/catalog-before.json
python scripts/collect-catalog-supplement.py --existing=data/catalog-before.json
node --env-file=<connection.env> --experimental-strip-types scripts/import-song-library.mjs --append --input=data/catalog-supplement/expansion.json --snapshot=data/catalog-supplement/merged-library.json
node --env-file=<connection.env> --experimental-strip-types scripts/import-song-library.mjs --verify --input=data/catalog-supplement/merged-library.json
```

Collector cần danh tính đã xác minh tại `data/artist-catalog/identities.json` (có thể giải nén bản công khai `catalog-result/identities.json.gz`). Cache ghi ở `data/catalog-supplement/responses`; chạy lại tái sử dụng kết quả. Script còn đọc lại các trang MusicBrainz đã có tại `data/artist-catalog/responses` để khôi phục Work thiếu type/ngôn ngữ, không quét lại toàn bộ bản thu. Nếu chưa có cache, phần này có thể rỗng; thống kê số trang/record đã xử lý và nguồn bao phủ được ghi trong tệp xuất. Không tuyên bố Wikidata hay roster bao phủ toàn bộ mọi bài từng phát hành.

Chỉ nhập sau khi collector kết thúc thành công. `source.complete` xác nhận tác vụ bổ sung đã hoàn tất, không phải lời cam kết độ phủ tuyệt đối. Bản xuất chứa tên, nghệ sĩ, ID và metadata công khai; không tải âm thanh, video, ảnh bìa hoặc lời bài hát.

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

`scripts/artist-catalog-roster.json` là danh sách biên tập 377 nghệ sĩ từ thời kỳ kinh điển đến 27/10/2026, giữ đủ 131 nghệ sĩ ban đầu, gồm cả Britney Spears và các nghệ sĩ Canada/Úc... Mốc thập niên dùng để nhóm theo giai đoạn nổi bật, không phải ngày ra mắt hay xếp hạng; không giới hạn năm phát hành của bài hát. Có thể thêm tên hoặc khai báo `name`, `country`, `type` để phân biệt nghệ sĩ trùng tên. `searchName` thêm tên dễ tìm như “98 Degrees” cho tên chuẩn “98°”.

Metadata `_meta` lưu ngày biên tập và nguồn tham khảo gần đây: Official Charts tuần 23/10/2026, IFPI 2025 và Spotify Wrapped 2025. Chỉ nhận tác phẩm tiếng Anh; không đưa mọi nghệ sĩ toàn cầu trong các bảng xếp hạng vào phạm vi US–UK. Danh sách đầy đủ ở `docs/us-uk-artists-2026.md`.

Chỉ tự chọn thực thể Artist có loại Person/Group và tên hoặc alias khớp chính xác. Không để một kết quả trùng tên chưa có loại nghệ sĩ ghi đè nghệ sĩ thật. Có thể ghim `mbid` kèm `identitySource` khi đã đối chiếu nguồn MusicBrainz, như Miley Cyrus hiện có tên chuẩn MILEY nhưng giữ nguyên mã nghệ sĩ. Cache danh tính có phiên bản; đổi bộ xác minh sẽ kiểm tra lại trước khi dùng. Nếu mã mới khác checkpoint, tác vụ dừng trường hợp đó để rà soát.

```powershell
python scripts/collect-artist-catalog.py
node --env-file=.env.local --experimental-strip-types scripts/import-song-library.mjs --append --input=data/artist-catalog/expansion.json --snapshot=data/artist-catalog/merged-library.json
node --env-file=.env.local --experimental-strip-types scripts/import-song-library.mjs --verify --input=data/artist-catalog/merged-library.json
```

Các nghệ sĩ trong `_meta.priority` được xếp trước (Britney Spears đầu tiên), sau đó xen kẽ các thời kỳ. Thu thập riêng một nghệ sĩ bằng `--only "Britney Spears"`, hoặc lặp lại `--only` cho một nhóm. Khi đó tệp xuất chỉ chứa tác phẩm của nhóm được chọn, dù dùng chung checkpoint với các nghệ sĩ khác. Dữ liệu đã hoàn tất được tiếp tục từ checkpoint; danh sách mục tiêu không đồng nghĩa toàn bộ danh mục đã được nhập.

Mỗi lượt quét mặc định tối đa 5 trang bản thu (500 bản), sau đó nhường cho nghệ sĩ tiếp theo. Nghệ sĩ còn trang sẽ quay lại ở lượt sau cho đến khi hoàn tất. Cách này giúp các danh mục nhỏ không phải chờ hàng chục nghìn bản live của một nghệ sĩ lớn. Có thể điều chỉnh bằng `--pages-per-pass 1..100`; không thay đổi giới hạn tốc độ chung, không cắt bớt trang và không đánh dấu danh mục đang dở là hoàn tất.

Tệp checkpoint/cache được ghi qua tệp tạm rồi thay thế nguyên tử. Trên Windows, nếu thao tác thay tệp bị khóa tạm thời bởi trình đọc hoặc phần mềm kiểm tra tệp, công cụ thử lại có giới hạn và giữ nguyên bản checkpoint hợp lệ trước đó; lỗi kéo dài vẫn được báo, không coi trang chưa lưu là đã hoàn tất.

Công cụ duyệt tất cả trang bản thu của từng nghệ sĩ, kiểm tra mã nghệ sĩ trong credit, liên kết tác phẩm Song và ngôn ngữ tiếng Anh rõ ràng. Dùng tối đa 4 kết nối đang chờ nhưng có một cổng tốc độ chung: các lần bắt đầu request cách nhau ít nhất 1,2 giây; gặp 503/429 sẽ backoff. Checkpoint/cache cho phép chạy tiếp. Bản thiếu ngôn ngữ hoặc liên kết tác phẩm được thống kê trong `source.artistReports`, không tạo mã giả hay cam kết bao phủ bài chưa có trên MusicBrainz.

Các bản cover cùng tác phẩm vẫn một Work ID. Giữ credit hiển thị hiện có, thêm nghệ sĩ của bản thu khác vào tên có thể tìm kiếm và lưu bằng chứng `source.performerCredits`; không ghép các ca sĩ của hai bản cover thành một bản song ca.

`--append` đọc và xác minh danh mục Turso đang hoạt động, gộp tác phẩm mới, giữ toàn bộ bài cũ và chỉ kích hoạt nếu phiên bản gốc chưa đổi trong lúc nhập. Không lấy JSON 20.000 bài cũ để thay thế danh mục online. Tệp snapshot chứa metadata công khai để đọc lại checksum sau nhập; không chứa khóa. Tổng dung lượng danh mục tối đa hiện tại là 100.000 tác phẩm, phân trang 4.000 bài mỗi request.
