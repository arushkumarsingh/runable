FROM oven/bun:1.1

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install

COPY src ./src

CMD ["bun", "run", "src/index.ts"]
