###### 关于改动的地方

- 修改了开源项目的 spring 配置文件，将数据库相关的配置抽取到了环境变量中。
- 修改了数据库初始化 sql 文件目录位置，放到了 classpath 根目录下，并在 spring 配置文件中指定 schema。
- mysql 镜像直接引用官方镜像，case-server 镜像基于 openjdk8 构建。（后续更新时需要同步更新 case-server 镜像）

###### 如何启动

- 首先要确定本地有docker环境并安装了docker-compose.
- 然后将agile.env 文件和 docker-compose.yml 文件放在同级目录下 docker-compose up 启动即可.



###### 一 .env 文件

```
vim agile.env

MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=case_manager
MYSQL_USER=agile
MYSQL_PASSWORD=agile
MYSQL_ROOT_PASSWORD=agile
TZ=Asia/Shanghai
AUTH_FLAG=false
```

###### 二. docker-compose.yml 文件
```
vim docker-compose.yml

version: '3'
services:
  case-server:
    image: yestodayhadrain/case-server:v1.0.6
    container_name: yuntu-caseserver
    env_file:
      - ./agile.env
    command: bash -c "cd /app/ && java -jar case-server-1.0-SNAPSHOT.jar"
    # docker 端口映射,如果宿主机 8080 端口被占用需要更改
    ports:
      - "8080:8094"
    depends_on:
      - mysql
    restart: always
    networks:
      - agile-net
  mysql:
    image: mysql:latest
    container_name: yuntu-mysql
    # 挂载到宿主机目录 /data/mysql/data 
    volumes:
      - /data/mysql/data:/var/lib/mysql
    env_file:
      - ./agile.env
    # docker 端口映射,如果宿主机 6666 端口被占用需要更改
    ports:
      - "6666:3306" 
    restart: always
    networks:
      - agile-net
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
networks:
  agile-net:
    driver: bridge
```
