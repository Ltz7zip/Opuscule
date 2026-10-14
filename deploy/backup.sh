#!/usr/bin/env bash
# 每日备份：SQLite 数据库 + 上传文件（media/），**加密**后留本机并推到异地。
#
# 用法（先 chmod +x）：
#   ./deploy/backup.sh
# 放进 crontab，每天 4 点跑一次：
#   0 4 * * * /srv/opuscule/deploy/backup.sh >> /var/log/opuscule-backup.log 2>&1
#
# 配置（建议写进 /etc/opuscule.env，脚本会自动加载；cron 不会自己读它）：
#   BACKUP_AGE_RECIPIENT   必填。age 公钥（形如 age1...）。**只放公钥**，私钥离线保管。
#   BACKUP_RCLONE_REMOTE   异地目标（rclone 远端），如 oss:opuscule-backup/ 或 sftp:host/backups/。
#                          不填就只留本机——机器挂了备份也没了，生产上别这么干。
#   BACKUP_DIR             本机存放目录，默认 /var/backups/opuscule
#   KEEP_DAYS              本机保留天数，默认 14
#
# 依赖：age（加密）、rclone（异地，仅配了 BACKUP_RCLONE_REMOTE 时才需要）。
#   apt install age rclone
set -euo pipefail

# cron 不加载登录环境，这里主动读一次部署环境文件（存在才读）
if [[ -f /etc/opuscule.env ]]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/opuscule.env
  set +a
fi

APP_DIR=${APP_DIR:-/srv/opuscule}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/opuscule}
KEEP_DAYS=${KEEP_DAYS:-14}
AGE_RECIPIENT=${BACKUP_AGE_RECIPIENT:-}
RCLONE_REMOTE=${BACKUP_RCLONE_REMOTE:-}
STAMP=$(date +%Y%m%d-%H%M%S)

# 加密是硬要求：没配公钥就直接不干，免得产出「明文备份躺在磁盘上」这种假安全感
if [[ -z "$AGE_RECIPIENT" ]]; then
  echo "错误：未设置 BACKUP_AGE_RECIPIENT（age 公钥），拒绝生成未加密的备份。" >&2
  echo "  生成密钥对：age-keygen -o backup.key    # 私钥离线保存，丢了备份就再也解不开" >&2
  echo "  把打印出的 public key（age1...）填进 BACKUP_AGE_RECIPIENT。" >&2
  exit 1
fi
command -v age >/dev/null || { echo "错误：未安装 age（apt install age）" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"

# 明文只在临时目录短暂停留，脚本结束（含出错）时随 trap 一起清掉
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# 1) 数据库：用 sqlite3 的 .backup 做在线一致快照，避免拷到写了一半的库（见文档 §7.1）
sqlite3 "$APP_DIR/db.sqlite3" ".backup '$WORK/db.sqlite3'"

# 2) 上传的地图底图
tar -czf "$WORK/media.tar.gz" -C "$APP_DIR" media

# 3) 加密落盘：公钥加密，服务器上没有私钥，即便机器被偷也解不开
age -r "$AGE_RECIPIENT" -o "$BACKUP_DIR/db-$STAMP.sqlite3.age"   "$WORK/db.sqlite3"
age -r "$AGE_RECIPIENT" -o "$BACKUP_DIR/media-$STAMP.tar.gz.age" "$WORK/media.tar.gz"

# 4) 本机只留最近 KEEP_DAYS 天
find "$BACKUP_DIR" -name 'db-*.age'    -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'media-*.age' -mtime +"$KEEP_DAYS" -delete

# 5) 推到异地。rclone 能对接对象存储（S3 / OSS / B2 …）、SFTP、WebDAV 等
if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v rclone >/dev/null || { echo "错误：配了 BACKUP_RCLONE_REMOTE 但没装 rclone" >&2; exit 1; }
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include '*.age'
  echo "[$(date '+%F %T')] 已加密并同步到异地：$STAMP -> $RCLONE_REMOTE"
else
  echo "[$(date '+%F %T')] 警告：未配置 BACKUP_RCLONE_REMOTE，备份只在本机（$BACKUP_DIR）！" >&2
fi

echo "[$(date '+%F %T')] 备份完成：$STAMP"
