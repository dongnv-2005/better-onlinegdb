FROM alpine:3.18

# Cài đặt gcc, libc-dev và coreutils (để có lệnh timeout chuẩn)
RUN apk add --no-cache gcc libc-dev coreutils

# Tạo user không có quyền root để chạy an toàn
RUN adduser -D -u 1001 sandbox_user

USER sandbox_user
WORKDIR /app