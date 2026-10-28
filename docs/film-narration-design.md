# Thiết kế giọng đọc AI cho quiz phim

Trạng thái: đã triển khai lời dẫn, chọn thời điểm đọc cho quiz phim và chống tự phát lặp. Chưa nghe thử dịch vụ WaveNet thật trong môi trường cloud.

## Trải nghiệm

AI đóng vai MC tiếng Việt: rõ chữ, thân thiện, có nhịp nghỉ trước tên phim. Dùng WaveNet hiện có, tốc độ mặc định 1.05. Không thêm lời bình tự sinh, không tự dịch tên phim hoặc suy đoán diễn viên. Nội dung lấy từ dữ liệu quiz và mẫu lời dẫn cố định để đúng luật, có thể kiểm thử và chuẩn bị âm thanh trước.

## Kịch bản theo thời điểm

| Thời điểm | Lời đọc mẫu | Quy tắc |
| --- | --- | --- |
| Đầu vòng xem chung | “Vòng 1. Cùng xem, cùng đoán. Xem đoạn phim, sau đó tìm và chọn tên phim. Chọn là gửi đáp án ngay. Nếu sai, bạn có thể chọn lại trước khi hết giờ.” | Chỉ giới thiệu luật một lần ở câu đầu vòng. Thay hướng dẫn theo SEARCH, TEXT hoặc CHOICE. |
| Đầu vòng đấu giá | “Vòng 2. Đấu giá thời gian. Đọc gợi ý và chọn số giây bạn cần xem. Mọi người bắt đầu cùng lúc. Mỗi người xem theo thời gian đã chọn và chỉ được trả lời một lần.” | Không nói nhóm ít giây xem trước vì luật hiện tại phát đồng thời. |
| Đầu vòng gợi ý | “Vòng 3. Đoán phim qua gợi ý. Bấm Tôi biết để giành quyền trả lời. Đúng sẽ nhận điểm của gợi ý hiện tại. Trả lời sai hoặc hết giờ, bạn dừng câu này.” | Số gợi ý lấy theo luật thực tế; không đọc cứng số lượng nếu khác giữa các quiz. |
| Đấu giá | “Gợi ý: [nội dung gợi ý]. Bạn cần xem bao nhiêu giây?” | Chỉ đọc gợi ý đã công khai. Không đọc lại khi chuyển sang công bố thời gian. |
| Chiếu clip | Im lặng. | Dừng lời đọc đang phát khi bắt đầu clip. Không đọc đếm ngược. |
| Bắt đầu trả lời | “Tên phim là gì?” | Câu ngắn, không đọc lại toàn bộ luật. Luật và cách trả lời được đọc ở phần giới thiệu vòng; nút nghe lại phát nội dung của màn hiện tại. |
| Mở gợi ý | “Gợi ý 2. [nội dung].” | Chỉ đọc gợi ý đang mở. Dừng ngay khi có người giành quyền hoặc chuyển câu. |
| Công bố kết quả | “Đáp án là: [tên phim].” | Chỉ phát khi máy chủ đã công bố. Không tự gắn nhãn đạo diễn/diễn viên cho trường artist vì trường này chưa có cấu trúc vai trò. |
| Bảng điểm | Im lặng. | Không lặp đáp án đã đọc ở màn kết quả. |

Hướng dẫn trả lời: SEARCH dùng “Tìm tên phim hoặc diễn viên. Chọn phim là gửi ngay”; TEXT dùng “Nhập tên phim rồi bấm Gửi đáp án”; CHOICE dùng “Chọn một trong bốn đáp án. Chỉ chọn một lần. Kết quả hiện khi hết giờ”. Quyền thử lại lấy từ luật máy chủ, không suy ra từ nhãn màn hình.

## Điều khiển

Giữ menu Âm thanh hiện có, gồm Tự đọc, Nghe lại/Dừng đọc và âm lượng Giọng đọc. Nút nghe lại có tên theo nội dung: “Nghe luật”, “Nghe gợi ý”, “Nghe đáp án”. Khi chưa cấu hình dịch vụ, hiển thị “Giọng đọc chưa sẵn sàng”; trò chơi vẫn chạy. Khi trình duyệt chặn tự phát, hiển thị nút “Bật giọng đọc”. Lưu lựa chọn trên từng thiết bị; thao tác của host không tự đổi âm lượng người khác.

Tiếng Việt là mặc định. Tiếng Anh dùng mẫu hướng dẫn tiếng Anh, giữ nguyên nội dung và tên phim người tạo nhập; không quảng cáo đây là tính năng dịch câu hỏi.

## Phối hợp âm thanh và thời gian

- Luật đầu vòng phải vừa khoảng giới thiệu hiện tại 18 giây; đo thời lượng audio thật để rút gọn mẫu trước phát hành.
- Timer và phase do máy chủ quyết định. Không chờ TTS mới bắt đầu thời gian trả lời; lỗi TTS không giữ phòng chơi lại.
- Chuẩn bị trước lời dẫn trên máy chủ. Nếu audio đến sau khi phase đổi, hủy phản hồi và không phát lời cũ.
- Đáp án tự đọc ở màn kết quả khi không có clip công bố. Nếu có clip, ưu tiên clip và chỉ đọc tự động ở bảng điểm kế tiếp; khóa theo câu để không đọc hai lần. Nếu clip không tải được, vẫn cho nghe đáp án thủ công.
- Pause dừng audio; nội dung đã bắt đầu phát không tự đọc lại từ đầu khi resume. Người chơi có thể chọn Nghe lại. Chuyển câu hủy mọi audio và yêu cầu đang chờ.
- Lời đọc đang chạy được hạ hiệu ứng nền; không giảm tiếng clip trong lúc xem để nhường chỗ cho lời dẫn.

## Áp dụng vào mã hiện tại

1. `src/lib/narrationText.ts`: tách mẫu lời dẫn phim, bổ sung biến thể hướng dẫn ngắn và đầy đủ; giữ kiểm tra phase và quyền xem đáp án phía máy chủ.
2. `src/lib/roundIntro.ts`: thống nhất lời hướng dẫn theo cách trả lời và luật thử lại thực tế.
3. `src/components/GameRoom.tsx`: chọn sự kiện đọc theo vòng, câu, phase và personal.stage. Hỗ trợ lúc trả lời riêng trong MEDIA_PLAYING của đấu giá đồng thời. Chọn thời điểm đọc kết quả theo việc có clip công bố.
4. `src/components/NarrationControl.tsx`: chống đọc lặp theo sự kiện, hủy audio cũ, xử lý pause/resume và nút nghe lại; tách Tự đọc khỏi khả năng nghe thủ công.
5. `src/app/api/narration/route.ts`: tiếp tục tạo văn bản từ state đã xác thực, không nhận văn bản đáp án tùy ý từ người chơi. Chuẩn bị cả intro và biến thể đọc thực tế; không trả audio riêng tư sớm.

Không cần đổi nhà cung cấp TTS hoặc schema database cho phiên bản đầu. Chỉnh cách phát âm tên phim riêng chỉ thêm sau khi có mẫu audio thực tế cần sửa.

## Tiêu chí nghiệm thu

- Ba kiểu vòng và ba cách trả lời đều có lời dẫn đúng luật phim, không dùng “bài hát/ca sĩ/nghe nhạc”. Quiz nhạc vẫn giữ hành vi hiện có.
- Không lấy được audio đáp án trước kết quả; không đọc gợi ý chưa mở hoặc thông tin trả lời của người khác.
- Không chồng tiếng lên clip, không phát muộn sau đổi phase, không lặp đáp án khi sang bảng điểm hoặc kết nối lại.
- Kiểm tra đấu giá với hai người có thời điểm trả lời riêng khác nhau; mỗi người chỉ nhận hướng dẫn đúng lúc của mình.
- Kiểm tra tắt tự đọc nhưng nghe thủ công, âm lượng 0, pause/resume, trình duyệt chặn tự phát và dịch vụ TTS lỗi/chậm.
- Unit test kiểm tra văn bản/quyền truy cập và sự kiện đọc; kiểm thử trình duyệt kiểm tra phát/dừng thực tế. Kiểm thử giọng WaveNet thật cần cấu hình dịch vụ an toàn; mock API không xác nhận chất lượng phát âm.
