FROM alpine:3.18

# Cài đặt các công cụ biên dịch, gỡ lỗi và clangd 
RUN apk add --no-cache gcc libc-dev coreutils gdb clang-extra-tools bash

WORKDIR /app

RUN adduser -D -u 1001 sandbox_user

RUN chown -R sandbox_user:sandbox_user /app

USER sandbox_user