# RDS-Board single-repo single image: web dist + hub server (lobby/signaling/static)
FROM node:22-alpine AS build
WORKDIR /repo
RUN npm i -g pnpm@10.32.1
COPY package.json pnpm-lock.yaml ./
RUN npm_config_manage_package_manager_versions=false pnpm install
COPY . .
RUN npm_config_manage_package_manager_versions=false pnpm build

FROM node:22-alpine
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/dist ./dist
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.json vite.config.ts index.html ./
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
CMD ["./node_modules/.bin/tsx", "apps/server/src/index.ts"]
