export function gameErrorStatus(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 if(/Phiên người chơi không hợp lệ|Không có quyền truy cập/.test(message))return 401;
 if(/Không tìm thấy phòng/.test(message))return 404;
 return 503;
}
