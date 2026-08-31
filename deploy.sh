#!/bin/bash
# ============================================
# Pet Travel Agent - 阿里云一键部署脚本
# 
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh [选项]
#
# 选项:
#   --local        本地Docker运行（默认）
#   --aliyun       部署到阿里云ECS
#   --build        仅构建镜像
#   --push         推送到阿里云镜像仓库
#   --logs         查看日志
#   --stop         停止服务
#   --restart      重启服务
#   --clean        清理所有资源
# ============================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
IMAGE_NAME="pet-travel-agent"
IMAGE_TAG="latest"
CONTAINER_NAME="pet-travel-agent"
PORT=${PORT:-3000}

# 打印带颜色的信息
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BLUE}[STEP]${NC} $1"; }

# 检查前置条件
check_prerequisites() {
    log_step "检查前置条件..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    log_info "Docker版本: $(docker --version)"
    
    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_warn "Docker Compose未安装，将使用docker run方式"
    fi
    
    # 检查.env文件
    if [ ! -f ".env" ]; then
        log_warn ".env文件不存在，从示例创建..."
        cp .env.example .env
        log_error "请编辑 .env 文件填入智谱API Key后重新运行！"
        exit 1
    fi
    
    # 检查API Key
    if grep -q "your_zhipu_api_key_here" .env; then
        log_error "请在 .env 中设置正确的 ZHIPU_API_KEY"
        exit 1
    fi
    
    log_info "前置条件检查通过 ✓"
}

# 构建镜像
build_image() {
    log_step "构建Docker镜像..."
    docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .
    log_info "镜像构建完成: ${IMAGE_NAME}:${IMAGE_TAG}"
}

# 本地运行
run_local() {
    check_prerequisites
    
    log_step "启动本地服务..."
    
    # 创建必要目录
    mkdir -p uploads logs
    
    # 使用docker compose或docker run
    if docker compose version &> /dev/null 2>&1; then
        docker compose up -d --build
    elif command -v docker-compose &> /dev/null; then
        docker-compose up -d --build
    else
        # 停止已存在的容器
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
        
        # 运行新容器
        docker run -d \
            --name ${CONTAINER_NAME} \
            --restart unless-stopped \
            -p ${PORT}:3000 \
            --env-file .env \
            -v "$(pwd)/uploads:/app/uploads" \
            -v "$(pwd)/logs:/app/logs" \
            ${IMAGE_NAME}:${IMAGE_TAG}
    fi
    
    echo ""
    log_info "==========================================="
    log_info "🎉 服务启动成功！"
    log_info "==========================================="
    log_info "访问地址: http://localhost:${PORT}"
    log_info "健康检查: http://localhost:${PORT}/health"
    log_info "API文档:   http://localhost:${PORT}/api/status"
    echo ""
    log_info "常用命令:"
    log_info "  查看日志: ./deploy.sh --logs"
    log_info "  停止服务: ./deploy.sh --stop"
    log_info "  重启服务: ./deploy.sh --restart"
}

# 阿里云部署
deploy_aliyun() {
    log_step "准备部署到阿里云..."
    
    # 检查阿里云CLI
    if ! command -v aliyun &> /dev/null; then
        log_warn "阿里云CLI未安装，请手动部署"
        log_info "手动部署步骤见下方说明"
    fi
    
    # 推送镜像到阿里云容器镜像服务
    REGISTRY="${ALIYUN_REGISTRY:-registry.cn-hangzhou.aliyuncs.com}"
    NAMESPACE="${ALIYUN_NAMESPACE:-your-namespace}"
    REPOSITORY="${ALIYUN_REPO:-pet-travel-agent}"
    
    FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${REPOSITORY}:${IMAGE_TAG}"
    
    log_step "标记镜像..."
    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${FULL_IMAGE}
    
    log_step "推送镜像到阿里云..."
    docker push ${FULL_IMAGE}
    
    log_info "镜像推送完成: ${FULL_IMAGE}"
    echo ""
    log_info "==========================================="
    log_info "阿里云ECS部署命令:"
    log_info "==========================================="
    echo ""
    echo "# 1. 在ECS上拉取镜像"
    echo "docker pull ${FULL_IMAGE}"
    echo ""
    echo "# 2. 运行容器"
    echo "docker run -d \\"
    echo "  --name pet-travel-agent \\"
    echo "  --restart unless-stopped \\"
    echo "  -p 80:3000 \\"
    echo "  -e ZHIPU_API_KEY=\$ZHIPU_API_KEY \\"
    echo "  -v /data/pet-agent/uploads:/app/uploads \\"
    echo "  ${FULL_IMAGE}"
    echo ""
    log_info "==========================================="
}

# 查看日志
show_logs() {
    if docker ps -q -f name=${CONTAINER_NAME} | grep -q .; then
        docker logs -f --tail 100 ${CONTAINER_NAME}
    else
        log_error "容器未运行"
    fi
}

# 停止服务
stop_service() {
    log_step "停止服务..."
    
    if docker compose version &> /dev/null 2>&1; then
        docker compose down
    elif command -v docker-compose &> /dev/null; then
        docker-compose down
    else
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
    fi
    
    log_info "服务已停止"
}

# 重启服务
restart_service() {
    stop_service
    sleep 2
    run_local
}

# 清理资源
clean_all() {
    log_warn "这将删除所有容器、镜像和数据！"
    read -p "确认继续? (y/N) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_step "清理资源..."
        
        docker compose down -v --rmi all 2>/dev/null || true
        docker stop ${CONTAINER_NAME} 2>/dev/null || true
        docker rm ${CONTAINER_NAME} 2>/dev/null || true
        docker rmi ${IMAGE_NAME}:${IMAGE_TAG} 2>/dev/null || true
        
        rm -rf uploads/* logs/*
        
        log_info "清理完成"
    else
        log_info "取消操作"
    fi
}

# 主入口
case "${1:-local}" in
    --local|local)
        run_local
        ;;
    --aliyun|aliyun)
        build_image
        deploy_aliyun
        ;;
    --build|build)
        check_prerequisites
        build_image
        ;;
    --push|push)
        build_image
        deploy_aliyun
        ;;
    --logs|logs)
        show_logs
        ;;
    --stop|stop)
        stop_service
        ;;
    --restart|restart)
        restart_service
        ;;
    --clean|clean)
        clean_all
        ;;
    --help|-h|help)
        echo "Pet Travel Agent 部署脚本"
        echo ""
        echo "用法: ./deploy.sh [选项]"
        echo ""
        echo "选项:"
        echo "  --local     本地Docker运行（默认）"
        echo "  --aliyun    部署到阿里云ECS"
        echo "  --build     仅构建镜像"
        echo "  --push      推送到阿里云镜像仓库"
        echo "  --logs      查看运行日志"
        echo "  --stop      停止服务"
        echo "  --restart   重启服务"
        echo "  --clean     清理所有资源"
        echo "  --help      显示帮助信息"
        ;;
    *)
        log_error "未知选项: $1"
        echo "使用 './deploy.sh --help' 查看帮助"
        exit 1
        ;;
esac
