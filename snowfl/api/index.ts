import { DOMParser } from "linkedom"

import { SortFilter } from "../models/filters"
import { SnowflAPIResponseItem } from "../models/search"

interface CacheProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
}

class SnowflClient {
  private hash: string | null = null
  private readonly baseUrl = "https://snowfl.com"
  private readonly cacheTTL = 3600 // 1 hour cache

  constructor(private readonly cache?: CacheProvider) {}

  private async getCached<T>(
    key: string,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    if (!this.cache) {
      return fetchFn()
    }

    const cached = await this.cache.get(key)
    if (cached) {
      return JSON.parse(cached)
    }

    const data = await fetchFn()
    await this.cache.set(key, JSON.stringify(data), this.cacheTTL)
    return data
  }

  private async getHash(): Promise<string> {
    if (this.hash) return this.hash

    const fetchHash = async () => {
      const response = await fetch(this.baseUrl)
      const DOM = new DOMParser()
      const html = await response.text()
      const document = DOM.parseFromString(html, "text/html")

      const scriptElement = document.body.querySelector(
        'script[src*="?v="]'
      ) as HTMLScriptElement

      const script = await fetch(`${this.baseUrl}/${scriptElement.src}`)
      const scriptText = await script.text()
      const match = scriptText.match(/\b(\w{33,47})\b/)
      this.hash = match?.[1] ?? ""
      return this.hash
    }

    return this.getCached("snowfl:hash", fetchHash)
  }

  async search(
    query: string,
    filter: SortFilter = SortFilter.SEED,
    page: number = 0
  ): Promise<SnowflAPIResponseItem[]> {
    const hash = await this.getHash()

    const url = new URL(
      `${hash}/${query}/${this.generateNonce()}/${page}/${filter}/NONE/1`,
      this.baseUrl
    )

    url.searchParams.set("_", Date.now().toString())

    const response = await fetch(url.toString())
    return response.json()
  }

  async getMagnetLink(item: SnowflAPIResponseItem): Promise<string> {
    const hash = await this.getHash()

    const encodedUrl = encodeURIComponent(
      Buffer.from(item.url).toString("base64")
    )

    const url = new URL(`${hash}/${item.site}/${encodedUrl}`, this.baseUrl)

    url.searchParams.set("_", Date.now().toString())

    const response = await fetch(url.toString())
    const data = (await response.json()) as { url: string }
    return data.url
  }

  private generateNonce(): string {
    return Math.random().toString(36).slice(-8)
  }
}

export default SnowflClient
