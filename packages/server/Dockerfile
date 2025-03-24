# NOTE: docker build . -t ta-server -f ./packages/server/Dockerfile
# build context should be the workspaces root directory

# build environment
FROM node:20-bullseye AS build
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH
RUN corepack enable
RUN yarn set version 4.5.0

# Install TypeScript globally for debugging purposes
# RUN yarn global add typescript
# # Check installed TypeScript version
ARG NODE_ENV=production
# RUN npm i typescript -g

# Copy the whole monorepo to allow Yarn workspaces to function
COPY ./packages/server /app/packages/server
COPY ./packages/lib /app/packages/lib
COPY ./packages/lti /app/packages/lti

COPY ./.env /app
COPY ./yarn.lock /app
COPY ./package.json /app
COPY ./.yarnrc.yml /app

# Install dependencies with Yarn, including workspace dependencies
RUN yarn install

# Generate Prisma client
WORKDIR /app/packages/server
RUN yarn prisma generate

# Run the build command for the server
RUN yarn build

# production environment
FROM node:20-bullseye
WORKDIR /app

# Copy built files from the build stage
COPY --from=build /app/packages/server/dist /app

# Copy Prisma schema and migrations
COPY --from=build /app/packages/server/prisma /app/prisma

# Expose the port the server runs on
EXPOSE 5000

# Docker compose will inject the DATABASE_URL environment variable
# Start the server and run migrations before starting the application
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
