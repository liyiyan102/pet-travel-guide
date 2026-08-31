/**
 * 联网搜索工具
 * 使用智谱AI独立的Web Search API
 */

const BaseTool = require('./base')
const config = require('../config')
const { logger } = require('../utils/logger')

// 智谱Web Search API端点
const WEB_SEARCH_URL = 'https://open.bigmodel.cn/api/paas/v4/web_search'

class WebSearchTool extends BaseTool {
  static get schema() {
    return {
      name: 'web_search',
      description: '联网搜索最新信息，适用于需要实时数据的场景（如开放时间、门票价格、新闻动态、政策更新等）',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词'
          },
          time_range: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year', 'any'],
            description: '时间范围限制'
          },
          num_results: {
            type: 'number',
            description: '返回结果数量（默认5）'
          }
        },
        required: ['query']
      }
    }
  }

  async execute(params) {
    const { query, time_range = 'any', num_results = 5 } = params

    logger.info('WebSearchTool', `搜索: ${query}, 时间范围: ${time_range}`)

    try {
      // 时间范围映射
      const recencyMap = {
        'day': 'oneDay',
        'week': 'oneWeek',
        'month': 'oneMonth',
        'year': 'oneYear',
        'any': 'noLimit'
      }

      // 调用智谱Web Search API
      const response = await fetch(WEB_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.zhipu.apiKey}`
        },
        body: JSON.stringify({
          search_query: query,
          search_engine: 'search_std',       // 基础版搜索引擎
          search_intent: false,              // 直接搜索，不做意图识别
          count: Math.min(num_results, 50),  // 最大50条
          search_recency_filter: recencyMap[time_range] || 'noLimit',
          content_size: 'medium'             // 返回摘要信息
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('WebSearchTool', `API错误: ${response.status} - ${errorText}`)
        throw new Error(`搜索API错误 [${response.status}]: ${errorText}`)
      }

      const data = await response.json()

      // 解析搜索结果
      const rawResults = data.search_result || []
      
      const results = rawResults.map(item => ({
        title: item.title || '',
        snippet: item.content || '',           // content字段包含摘要
        url: item.link || '',
        date: item.publish_date || new Date().toISOString().split('T')[0],
        source: item.media || item.refer || '',
        icon: item.icon || ''
      }))

      logger.info('WebSearchTool', `返回${results.length}条结果`)

      return {
        query,
        results,
        total: results.length,
        request_id: data.request_id,
        source: 'zhipu_web_search_api'
      }

    } catch (error) {
      logger.error('WebSearchTool', `搜索失败: ${error.message}`)
      
      // 如果是余额不足等API错误，返回模拟结果而非抛出异常
      if (error.message.includes('余额') || error.message.includes('429') || error.message.includes('403')) {
        logger.warn('WebSearchTool', '联网搜索不可用，使用LLM知识兜底')
        return {
          query,
          results: [{
            title: 'AI知识库回答',
            snippet: `关于"${query}"的信息，建议参考权威来源获取最新数据。`,
            url: '',
            date: new Date().toISOString().split('T')[0],
            source: 'ai_fallback'
          }],
          total: 1,
          source: 'ai_fallback',
          warning: '联网搜索暂不可用，已使用本地知识回答'
        }
      }
      
      throw error
    }
  }
}

module.exports = WebSearchTool
