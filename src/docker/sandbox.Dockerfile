FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
  bash curl git ca-certificates \
  python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
CMD ["bash"]
