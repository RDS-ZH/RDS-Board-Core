# ==========================================
# 1. 构建阶段 (Build Stage)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm 并禁用构建前冗余依赖验证
RUN npm install -g pnpm@12.14.0 && \
    pnpm config set verify-deps-before-run false

# 复制依赖定义
COPY package.json pnpm-lock.yaml ./

# 安装完整依赖并允许 esbuild 编译脚本
RUN pnpm install --frozen-lockfile --allow-build esbuild

# 复制工程源码
COPY . .

# 执行生产静态构建 (产物输出至 /app/dist)
RUN pnpm run build

# ==========================================
# 2. 方案补充：Node.js 运行时容器 (预览/测试环境)
# ==========================================
FROM node:22-alpine AS node-runner

WORKDIR /app

RUN npm install -g pnpm@12.14.0

COPY --from=builder /app ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["pnpm", "exec", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]

# ==========================================
# 3. 方案一 (默认)：Nginx 高性能生产容器
# ==========================================
FROM nginx:alpine AS production

# 复制自定义 Nginx 配置 (包含 SPA 路由回退、Gzip、WASM MIME 支持及安全头)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制打包静态资源
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
