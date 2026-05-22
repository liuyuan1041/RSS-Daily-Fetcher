/* eslint-disable no-undef */
/**
 * RSS Daily Translator - Main Plugin Code
 * Based on Jasminum plugin structure for Zotero 7/8
 */

"use strict";

var RSSDailyTranslator = {
  prefs: null,
  hooks: null,
};

(function () {
  const PREF_PREFIX = "extensions.zotero.rssdailytranslate.";
  const PLUGIN_ID = "rssdailytranslator@polygon.org";
  const EXTRA_FIELD_MANAGED = "rssDailyManaged";
  const EXTRA_FIELD_SOURCE_KEY = "rssDailySourceKey";
  const EXTRA_FIELD_MISSING_SINCE = "rssDailyMissingSince";

  const MANAGED_FLAG_VALUE = "1";
  const RUN_COLLECTION_NAME_PATTERN = /^\d{8}-\d{4}$/;
  const SOURCE_KEY_PREFIX_DOI = "doi:";
  const SOURCE_KEY_PREFIX_GUID = "guid:";
  const SOURCE_KEY_PREFIX_LINK = "link:";
  const SOURCE_KEY_PREFIX_TITLE = "title:";

  const CLEANUP_SKIP_DISABLED = "disabled";
  const CLEANUP_SKIP_NO_COLLECTION = "no_collection";
  const CLEANUP_SKIP_NO_ITEMS = "no_items_found";
  const CLEANUP_SKIP_BUSY = "busy";

  // ============ Utility Functions ============

  function log(message) {
    Zotero.debug("[RSS Daily Translator] " + message);
  }

  function getPref(key, defaultValue) {
    const value = Zotero.Prefs.get(PREF_PREFIX + key, true);
    return value !== undefined && value !== null ? value : defaultValue;
  }

  function setPref(key, value) {
    Zotero.Prefs.set(PREF_PREFIX + key, value, true);
  }

  function getPositiveNumberPref(key, defaultValue) {
    const value = Number(getPref(key, defaultValue));
    return Number.isFinite(value) && value > 0 ? value : defaultValue;
  }

  function getCollectionId(collection) {
    if (!collection) return null;
    const id = collection.id || collection.collectionID;
    return id != null ? id : null;
  }

  function normalizeCollectionId(id) {
    if (id == null) return null;
    const num = Number(id);
    return Number.isFinite(num) && num > 0 ? num : String(id);
  }

  function collectionIdsEqual(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
  }

  // ============ Plugin Initialization ============

  function init() {
    Zotero.RSSDailyTranslator = RSSDailyTranslator;

    RSSDailyTranslator.prefs = new PrefsHandler();
    RSSDailyTranslator.hooks = {
      onStartup,
      onShutdown,
      onMainWindowLoad,
      onMainWindowUnload,
      onPrefsWindowLoad,
    };

    log("Plugin initialized");
  }

  // ============ Hooks ============

  async function onStartup() {
    log("onStartup called");

    await Promise.all([
      Zotero.initializationPromise,
      Zotero.unlockPromise,
      Zotero.uiReadyPromise,
    ]);

    // Register preference pane
    registerPrefsPane();

    // Initialize default feeds if not set
    await ensureDefaultFeeds();
    migrateLegacyParentCollectionName();

    // Schedule next run if enabled
    if (getPref("enabled", true)) {
      scheduleNextRun();
    }

    log("onStartup complete");
  }

  function onShutdown() {
    log("onShutdown called");
    clearTimer();
  }

  async function onMainWindowLoad(window) {
    log("onMainWindowLoad called");
  }

  function onMainWindowUnload(window) {
    log("onMainWindowUnload called");
  }

  async function onPrefsWindowLoad(window) {
    log("onPrefsWindowLoad called");

    // Wait for the document to be fully loaded
    await Zotero.Promise.delay(100);

    updateSummaryLabel(window);
    log("onPrefsWindowLoad complete");
  }

  // ============ Preference Pane Registration ============

  function registerPrefsPane() {
    log("registerPrefsPane called");

    if (!Zotero.PreferencePanes) {
      log("PreferencePanes not available");
      return;
    }

    try {
      Zotero.PreferencePanes.register({
        pluginID: PLUGIN_ID,
        src: "chrome://rssdailytranslator/content/preferences.xhtml",
        label: "RSS Daily Fetcher",
        image: "chrome://rssdailytranslator/content/icons/favicon.png",
      });
      log("Preference pane registered successfully");
    } catch (e) {
      log("Failed to register preference pane: " + e);
      Zotero.logError(e);
    }
  }

  // ============ Default Feeds ============

  async function ensureDefaultFeeds() {
    const existingFeeds = getPref("feeds", "");
    if (existingFeeds && existingFeeds.trim()) {
      return;
    }

    // Default RSS feeds
    const defaultFeeds = [
      "https://ieeexplore.ieee.org/rss/TOC4609443.XML",
      "https://www.tandfonline.com/feed/rss/tgrs20",
    ].join("\n");

    setPref("feeds", defaultFeeds);
    log("Default feeds set");
  }

  function migrateLegacyParentCollectionName() {
    const current = (getPref("targetParentCollection", "") || "").trim();
    if (current === "每日 RSS 译文") {
      setPref("targetParentCollection", "每日RSS论文");
      log("Migrated target parent collection name to 每日RSS论文");
    }
  }

  // ============ Scheduler ============

  let _timer = null;
  let _runInProgress = false;

  function scheduleNextRun() {
    clearTimer();

    if (!getPref("enabled", true)) {
      return;
    }

    const intervalMinutes = getPref("scheduleMinutes", 180);
    log("Scheduling next run in " + intervalMinutes + " minutes");

    _timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    _timer.initWithCallback(
      {
        notify: async () => {
          if (isRunInProgress()) {
            log("Timer fired but previous run is still in progress, skip this cycle");
            scheduleNextRun();
            return;
          }

          log("Timer fired, running now");
          await runNow("scheduler");
          scheduleNextRun();
        },
      },
      intervalMinutes * 60 * 1000,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  }

  function clearTimer() {
    if (_timer) {
      _timer.cancel();
      _timer = null;
    }
  }

  function isRunInProgress() {
    return _runInProgress;
  }

  // ============ Main Processing ============

  async function runNow(source) {
    if (_runInProgress) {
      log("runNow skipped because another run is in progress, source=" + source);
      return {
        source,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        feedsProcessed: 0,
        feedsFailed: 0,
        itemsFound: 0,
        itemsCreated: 0,
        itemsExisting: 0,
        itemsUpdated: 0,
        itemsTranslated: 0,
        itemsQueued: 0,
        cleanupMarked: 0,
        cleanupDeleted: 0,
        cleanupCollectionsDeleted: 0,
        cleanupRestored: 0,
        cleanupOrphanCleaned: 0,
        cleanupRemovedFromParent: 0,
        cleanupSkipped: CLEANUP_SKIP_BUSY,
        retryQueueSize: loadRetryQueue().length,
        errors: [],
      };
    }

    _runInProgress = true;
    try {
      log("runNow called from: " + source);

      const runStartedAt = new Date();

      const summary = {
        source,
        startTime: runStartedAt.toISOString(),
        feedsProcessed: 0,
        feedsFailed: 0,
        itemsFound: 0,
        itemsCreated: 0,
        itemsExisting: 0,
        itemsUpdated: 0,
        itemsTranslated: 0,
        itemsQueued: 0,
        cleanupMarked: 0,
        cleanupDeleted: 0,
        cleanupCollectionsDeleted: 0,
        cleanupRestored: 0,
        cleanupOrphanCleaned: 0,
        cleanupRemovedFromParent: 0,
        cleanupSkipped: "",
        errors: [],
      };

      const translationQueue = new Map();
      const seenSourceKeys = new Set();

      let runCollections = null;
      try {
        runCollections = await prepareRunCollections(runStartedAt);
        if (runCollections?.runCollection) {
          summary.newItemsCollection = runCollections.runCollection.name;
        }

        const feedsText = getPref("feeds", "");
        const feeds = feedsText
          .split("\n")
          .map((f) => f.trim())
          .filter((f) => f.startsWith("http"));

        summary.feedsProcessed = feeds.length;

        if (feeds.length === 0) {
          summary.errors.push("No feeds configured");
          updateSummaryData(summary);
          return summary;
        }

        for (const feedUrl of feeds) {
          try {
            log("Processing feed: " + feedUrl);
            const items = await fetchFeed(feedUrl);
            summary.itemsFound += items.length;

            for (const item of items) {
              try {
                const sourceKey = buildSourceKey(item);
                if (sourceKey) {
                  seenSourceKeys.add(sourceKey);
                }

                const result = await createZoteroItem(item, runCollections);
                if (result && result.created) {
                  summary.itemsCreated++;
                } else {
                  summary.itemsExisting++;
                  if (result && result.updated) {
                    summary.itemsUpdated++;
                  }
                }

                const itemKey = result?.item?.key || result?.item?.id;
                if (itemKey && result?.item) {
                  translationQueue.set(itemKey, {
                    item: result.item,
                    sourceTitle: item.title || "",
                  });
                }
              } catch (e) {
                const msg = item.title ? (item.title + ": " + e.message) : e.message;
                summary.errors.push(feedUrl + " -> " + msg);
                enqueueRetry(feedUrl, item, e.message);
                summary.itemsQueued++;
              }
            }
          } catch (e) {
            log("Error processing feed " + feedUrl + ": " + e);
            summary.errors.push(feedUrl + ": " + e.message);
            summary.feedsFailed++;
          }

          // Rate-limit arXiv: wait 12s between arXiv requests to avoid HTTP 429
          if (isArxivFeed(feedUrl)) {
            const arxivCount = feeds.filter(function (u) { return isArxivFeed(u); }).length;
            if (arxivCount > 1) {
              log("Waiting 12s before next arXiv feed (arXiv rate-limit)...");
              await Zotero.Promise.delay(12000);
            }
          }
        }

        // Phase 2: translate titles after fetch/ingest is fully completed.
        for (const entry of translationQueue.values()) {
          try {
            const translated = await translateTitleForItem(entry.item, entry.sourceTitle);
            if (translated) {
              summary.itemsTranslated++;
            }
          } catch (e) {
            const title = entry?.sourceTitle || entry?.item?.getField?.("title") || "(untitled)";
            summary.errors.push("translate -> " + title + ": " + e.message);
          }
        }

        if (seenSourceKeys.size > 0) {
          try {
            await cleanupStaleItems(seenSourceKeys, summary);
          } catch (e) {
            log("Cleanup failed but run continues: " + e);
            Zotero.logError(e);
            if (summary) {
              summary.cleanupSkipped = "error: " + (e.message || e);
            }
          }
        } else {
          summary.cleanupSkipped = CLEANUP_SKIP_NO_ITEMS;
        }
      } catch (e) {
        log("Error in runNow: " + e);
        summary.errors.push(e.message);
        Zotero.logError(e);
      }

      if (runCollections?.includeExistingInRun) {
        setPref("initialBatchSeeded", true);
      }

      summary.endTime = new Date().toISOString();
      summary.retryQueueSize = loadRetryQueue().length;
      updateSummaryData(summary);
      return summary;
    } finally {
      _runInProgress = false;
    }
  }

  function loadRetryQueue() {
    const raw = getPref("retryQueue", "[]");
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      log("Invalid retryQueue JSON, reset to empty: " + e);
      return [];
    }
  }

  function saveRetryQueue(queue) {
    const maxEntries = parseInt(getPref("cacheMaxEntries", 1000000), 10) || 1000000;
    const trimmed = queue.slice(-maxEntries);
    setPref("retryQueue", JSON.stringify(trimmed));
  }

  function enqueueRetry(feedUrl, item, errorMessage) {
    const queue = loadRetryQueue();
    const key = item.guid || item.doi || item.link || item.title;

    const existingIndex = queue.findIndex((q) => {
      const existingKey = q?.item?.guid || q?.item?.doi || q?.item?.link || q?.item?.title;
      return existingKey && key && existingKey === key;
    });

    const payload = {
      feedUrl,
      item,
      attempts: 0,
      lastError: errorMessage || "unknown error",
      nextRetryAt: Date.now(),
      queuedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      queue[existingIndex] = {
        ...queue[existingIndex],
        ...payload,
        attempts: queue[existingIndex].attempts || 0,
      };
    } else {
      queue.push(payload);
    }

    saveRetryQueue(queue);
  }

  async function processRetryQueue() {
    const queue = loadRetryQueue();
    const now = Date.now();
    const maxAttempts = parseInt(getPref("retryMaxAttempts", 3), 10) || 3;
    const baseMinutes = parseInt(getPref("retryBaseMinutes", 5), 10) || 5;

    const nextQueue = [];
    const stats = {
      queuedBefore: queue.length,
      retried: 0,
      succeeded: 0,
      failed: 0,
      dropped: 0,
      deferred: 0,
    };

    for (const entry of queue) {
      const attempts = entry.attempts || 0;
      const nextRetryAt = entry.nextRetryAt || 0;

      if (nextRetryAt > now) {
        nextQueue.push(entry);
        stats.deferred++;
        continue;
      }

      stats.retried++;
      try {
        await createZoteroItem(entry.item || {});
        stats.succeeded++;
      } catch (e) {
        const newAttempts = attempts + 1;
        stats.failed++;

        if (newAttempts >= maxAttempts) {
          stats.dropped++;
          continue;
        }

        const delayMs = baseMinutes * 60 * 1000 * Math.pow(2, newAttempts - 1);
        nextQueue.push({
          ...entry,
          attempts: newAttempts,
          lastError: e.message,
          nextRetryAt: Date.now() + delayMs,
        });
      }
    }

    saveRetryQueue(nextQueue);
    stats.queuedAfter = nextQueue.length;
    return stats;
  }

  function updateSummaryData(summary) {
    const summaryText = JSON.stringify(summary, null, 2);
    setPref("lastSummary", summaryText);
    setPref("lastSummaryText", formatSummaryText(summary));
    updateSummaryInAllPreferenceWindows();
  }

  function formatSummaryText(summary) {
    const lines = [
      "来源: " + (summary.source || "unknown"),
      "开始时间: " + (summary.startTime || "-"),
      "新增批次集合: " + (summary.newItemsCollection || "-"),
      "处理源数: " + (summary.feedsProcessed || 0),
      "抓取失败源: " + (summary.feedsFailed || 0),
      "抓取条目: " + (summary.itemsFound || 0),
      "新增条目: " + (summary.itemsCreated || 0),
      "已存在条目: " + (summary.itemsExisting || 0),
      "更新条目: " + (summary.itemsUpdated || 0),
      "标题已翻译: " + (summary.itemsTranslated || 0),
      "重试入队: " + (summary.itemsQueued || 0),
      "清理标记: " + (summary.cleanupMarked || 0),
      "清理恢复: " + (summary.cleanupRestored || 0),
      "清理移出父集合: " + (summary.cleanupRemovedFromParent || 0),
      "清理删除: " + (summary.cleanupDeleted || 0),
      "清理孤儿: " + (summary.cleanupOrphanCleaned || 0),
      "清理空集合: " + (summary.cleanupCollectionsDeleted || 0),
      "清理跳过: " + (summary.cleanupSkipped || "-"),
      "错误数: " + ((summary.errors && summary.errors.length) || 0),
      "结束时间: " + (summary.endTime || "-"),
      "重试队列: " + (summary.retryQueueSize || 0),
    ];

    if (summary.errors && summary.errors.length > 0) {
      lines.push("错误示例:");
      for (const err of summary.errors.slice(0, 3)) {
        lines.push("- " + err);
      }
    }

    return lines.join("\n");
  }

  function updateSummaryLabel(window) {
    const readable = getPref("lastSummaryText", "");
    const summary = getPref("lastSummary", "");
    const label = window.document.getElementById("rssdaily-last-summary-label");
    if (label) {
      if (readable) {
        label.textContent = readable;
      } else if (summary) {
        label.textContent = summary;
      } else {
        label.textContent = "尚未运行";
      }
    }
  }

  function updateSummaryInAllPreferenceWindows() {
    try {
      const prefWindows = Services.wm.getEnumerator("zotero:pref");
      while (prefWindows.hasMoreElements()) {
        const win = prefWindows.getNext();
        updateSummaryLabel(win);
      }
    } catch (e) {
      log("Failed to update summary in preference windows: " + e);
    }
  }

  function showFeedback(window, message, type = "info") {
    if (!window || !window.document) {
      return;
    }

    const label = window.document.getElementById("rssdaily-feedback-label");
    if (!label) {
      return;
    }

    const colorMap = {
      info: "#666",
      success: "#0a7f2e",
      error: "#b00020",
      warning: "#b26a00",
    };

    label.style.color = colorMap[type] || colorMap.info;
    label.textContent = message;
  }

  // ============ Feed Fetching ============

  function isArxivFeed(url) {
    return /arxiv\.org/i.test(url || "");
  }

  function getFeedTimeout(url) {
    return isArxivFeed(url) ? 120000 : 30000;
  }

  async function fetchFeed(url) {
    log("Fetching feed: " + url);

    const timeout = getFeedTimeout(url);
    try {
      const response = await Zotero.HTTP.request("GET", url, {
        responseType: "text",
        timeout: timeout,
      });

      if (!response || !response.responseText) {
        return [];
      }

      return parseFeed(response.responseText);
    } catch (e) {
      log("Failed to fetch feed: " + e);
      throw e;
    }
  }

  function parseFeed(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    // Check for parser errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      log("XML parse error: " + parseError.textContent);
      return [];
    }

    const items = [];
    const entries = doc.querySelectorAll("entry, item");

    for (const entry of entries) {
      const item = {
        title: getTextContent(entry, "title"),
        link: getTextContent(entry, "link") || getAttr(entry, "link", "href"),
        abstract: getTextContent(entry, "summary") || getTextContent(entry, "description"),
        published: getTextContent(entry, "published") || getTextContent(entry, "pubDate"),
        guid: getTextContent(entry, "id") || getTextContent(entry, "guid"),
        doi: extractDOI(entry),
      };

      if (item.title) {
        items.push(item);
      }
    }

    return items;
  }

  function getTextContent(parent, tagName) {
    const el = parent.querySelector(tagName);
    return el ? el.textContent.trim() : "";
  }

  function getAttr(parent, tagName, attr) {
    const el = parent.querySelector(tagName);
    return el ? el.getAttribute(attr) : "";
  }

  function extractDOI(entry) {
    const candidates = [
      getTextContent(entry, "id"),
      getTextContent(entry, "guid"),
      getTextContent(entry, "link"),
      getTextContent(entry, "description"),
    ];

    for (const raw of candidates) {
      if (!raw || !raw.includes("10.")) {
        continue;
      }

      const match = raw.match(/10\.\d+[^\s<>"']*/i);
      if (match && match[0]) {
        const normalized = normalizeDOI(match[0]);
        if (normalized) {
          return normalized;
        }
      }
    }

    return "";
  }

  function normalizeDOI(value) {
    if (!value) {
      return "";
    }

    let doi = ("" + value).trim();
    doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    doi = doi.replace(/^doi:\s*/i, "");
    doi = doi.split("?")[0].split("#")[0];
    doi = doi.replace(/[\]\[\)\(\}\{>,.;]+$/g, "");
    doi = doi.trim();

    return /^10\.\d+\/.+/.test(doi) ? doi : "";
  }

  function normalizeTextForKey(value) {
    return ("" + (value || "")).trim().replace(/\s+/g, " ").toLowerCase();
  }

  function buildSourceKey(feedItem) {
    if (!feedItem) {
      return "";
    }

    const doi = normalizeDOI(feedItem.doi || "");
    if (doi) {
      return SOURCE_KEY_PREFIX_DOI + doi.toLowerCase();
    }

    const guid = normalizeTextForKey(feedItem.guid || "");
    if (guid) {
      return SOURCE_KEY_PREFIX_GUID + guid;
    }

    const link = normalizeTextForKey(feedItem.link || "");
    if (link) {
      return SOURCE_KEY_PREFIX_LINK + link;
    }

    const title = normalizeTextForKey(feedItem.title || "");
    if (title) {
      return SOURCE_KEY_PREFIX_TITLE + title;
    }

    return "";
  }

  function escapeRegExp(value) {
    return ("" + value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getExtraFieldValue(item, fieldName) {
    if (!item || !fieldName) {
      return "";
    }

    let extraText = "";
    try {
      extraText = item.getField("extra") || "";
    } catch (e) { }

    if (!extraText) {
      return "";
    }

    const regex = new RegExp("^" + escapeRegExp(fieldName) + "\\s*:\\s*(.+)$", "im");
    const match = extraText.match(regex);
    return match && match[1] ? match[1].trim() : "";
  }

  function setExtraFieldValue(item, fieldName, value) {
    if (!item || !fieldName) {
      return false;
    }

    const normalized = (value || "").trim();
    const hasValue = !!normalized;

    let extraText = "";
    try {
      extraText = item.getField("extra") || "";
    } catch (e) { }

    const lines = (extraText || "").split(/\r?\n/).filter((line) => line !== "");
    const keyRegex = new RegExp("^" + escapeRegExp(fieldName) + "\\s*:", "i");
    let replaced = false;

    for (let i = 0; i < lines.length; i++) {
      if (keyRegex.test(lines[i])) {
        if (hasValue) {
          lines[i] = fieldName + ": " + normalized;
        } else {
          lines.splice(i, 1);
        }
        replaced = true;
        break;
      }
    }

    if (!replaced && hasValue) {
      lines.push(fieldName + ": " + normalized);
    }

    if (!replaced && !hasValue) {
      return false;
    }

    try {
      item.setField("extra", lines.join("\n"));
      return true;
    } catch (e) {
      log("extra field write failed: " + e);
      return false;
    }
  }

  // ============ Zotero Item Creation ============

  async function createZoteroItem(feedItem, runCollections = null) {
    log("Creating Zotero item for: " + feedItem.title);

    const parentCollection = runCollections?.parentCollection || await getOrCreateParentCollection();
    if (!parentCollection) {
      throw new Error("无法创建或获取目标集合");
    }

    const targetLibraryID = parentCollection.libraryID;

    const parentCollectionID = getCollectionId(parentCollection);
    const existing = await findExistingItem(feedItem, targetLibraryID, parentCollectionID);
    if (existing) {
      let updated = false;

      if (runCollections?.includeExistingInRun) {
        const linkedToRun = await ensureItemInRunCollection(existing, parentCollection, runCollections?.runCollection || null);
        if (linkedToRun) {
          updated = true;
        }
      }

      const existingDOI = (existing.getField("DOI") || "").trim();
      if (!existingDOI && feedItem.doi) {
        const doi = normalizeDOI(feedItem.doi);
        if (doi) {
          try {
            existing.setField("DOI", doi);
            updated = true;
          } catch (e) {
            log("Invalid DOI skipped for existing item '" + feedItem.title + "': " + doi + " -> " + e);
          }
        }
      }

      const existingURL = (existing.getField("url") || "").trim();
      if (!existingURL && feedItem.link) {
        try {
          existing.setField("url", feedItem.link);
          updated = true;
        } catch (e) {
          log("Invalid URL skipped for existing item '" + feedItem.title + "': " + feedItem.link + " -> " + e);
        }
      }

      if (ensureManagedMetadata(existing, feedItem)) {
        updated = true;
      }

      if (updated) {
        await existing.saveTx();
      }

      log("Item already exists and linked to collection: " + existing.key);
      return { item: existing, created: false, updated };
    }

    const item = new Zotero.Item("journalArticle");
    item.libraryID = targetLibraryID;
    item.setField("title", feedItem.title);

    if (feedItem.abstract) {
      item.setField("abstractNote", feedItem.abstract);
    }

    if (feedItem.doi) {
      const doi = normalizeDOI(feedItem.doi);
      if (doi) {
        try {
          item.setField("DOI", doi);
        } catch (e) {
          log("Invalid DOI skipped for item '" + feedItem.title + "': " + doi + " -> " + e);
        }
      }
    }

    if (feedItem.link) {
      try {
        item.setField("url", feedItem.link);
      } catch (e) {
        log("Invalid URL skipped for item '" + feedItem.title + "': " + feedItem.link + " -> " + e);
      }
    }

    await item.saveTx();
    await ensureItemInRunCollection(item, parentCollection, runCollections?.runCollection || null);
    ensureManagedMetadata(item, feedItem);
    await item.saveTx();
    log("Item created: " + item.key);

    return { item, created: true };
  }

  async function translateTitleForItem(item, sourceTitle = "") {
    if (!item) {
      return false;
    }

    let title = "";
    try {
      title = (item.getField("title") || "").trim();
    } catch (e) { }

    if (!title) {
      title = (sourceTitle || "").trim();
    }

    if (!title || !shouldTranslateTitle(item, title)) {
      return false;
    }

    const translatedTitle = await translateText(title);
    if (!translatedTitle || !translatedTitle.trim()) {
      return false;
    }

    const wrote = setTitleTranslationField(item, translatedTitle);
    if (!wrote) {
      return false;
    }

    clearLegacyShortTitle(item, translatedTitle);
    await item.saveTx();
    return true;
  }

  function getTitleTranslationField(item) {
    if (!item) {
      return "";
    }

    try {
      const value = item.getField("titleTranslation");
      if (value && ("" + value).trim()) {
        return ("" + value).trim();
      }
    } catch (e) { }

    const extraValue = getExtraFieldValue(item, "titleTranslation");
    if (extraValue) {
      return extraValue;
    }

    return "";
  }

  function shouldTranslateTitle(item, originalTitle) {
    const srcTitle = (originalTitle || "").trim();
    if (!item || !srcTitle) {
      return false;
    }

    // Check if "translate English only" is enabled
    const translateEnglishOnly = getPref("translateEnglishOnly", true);
    if (translateEnglishOnly && isChinese(srcTitle)) {
      // If only translating English content and the title is Chinese, skip it
      log("Title is Chinese and 'translate English only' is enabled, skipping");
      return false;
    }

    const titleTranslation = getTitleTranslationField(item);
    if (!titleTranslation) {
      return true;
    }

    if (titleTranslation.trim() === srcTitle) {
      return true;
    }

    if (!isChinese(titleTranslation)) {
      return true;
    }

    return false;
  }

  function setTitleTranslationField(item, translatedTitle) {
    const value = (translatedTitle || "").trim();
    if (!item || !value) {
      return false;
    }

    const wroteExtra = setExtraFieldValue(item, "titleTranslation", value);

    let wroteField = false;

    try {
      item.setField("titleTranslation", value);
      wroteField = true;
    } catch (e) {
      log("titleTranslation field write failed: " + e);
    }

    return wroteExtra || wroteField;
  }

  function clearLegacyShortTitle(item, translatedTitle) {
    if (!item || !translatedTitle) {
      return;
    }

    try {
      const shortTitle = (item.getField("shortTitle") || "").trim();
      if (!shortTitle) {
        return;
      }

      // Earlier versions wrote translation to shortTitle; clear it after migrating to titleTranslation.
      if (shortTitle === translatedTitle.trim() || shortTitle === getTitleTranslationField(item)) {
        item.setField("shortTitle", "");
      }
    } catch (e) {
      log("Failed to clear legacy shortTitle: " + e);
    }
  }

  function ensureItemInCollection(item, collection) {
    if (!item || !collection) {
      return false;
    }

    const collectionID = getCollectionId(collection);
    if (collectionID == null) {
      throw new Error("Invalid collection ID for target collection");
    }

    const current = typeof item.getCollections === "function" ? item.getCollections() : [];
    if (!Array.isArray(current)) {
      item.addToCollection(collectionID);
      return true;
    }

    const normalizedID = normalizeCollectionId(collectionID);
    const found = current.some(function (id) {
      return id === collectionID || normalizeCollectionId(id) === normalizedID;
    });

    if (!found) {
      item.addToCollection(collectionID);
      return true;
    }

    return false;
  }

  async function ensureItemInRunCollection(item, parentCollection, runCollection = null) {
    if (!item || !parentCollection) {
      return false;
    }

    let targetCollection = runCollection;
    if (!targetCollection) {
      targetCollection = await getOrCreateChildCollection(parentCollection, getRunCollectionName());
      if (!targetCollection) {
        return false;
      }
    }

    return ensureItemInCollection(item, targetCollection);
  }

  function getRunCollectionName(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}-${hour}${minute}`;
  }

  async function getOrCreateParentCollection() {
    const parentCollectionName = (getPref("targetParentCollection", "每日RSS论文") || "").trim() || "每日RSS论文";
    return getOrCreateCollection(parentCollectionName);
  }

  async function prepareRunCollections(runStartedAt = new Date()) {
    const parentCollection = await getOrCreateParentCollection();
    if (!parentCollection) {
      return null;
    }

    const includeExistingInRun = !getPref("initialBatchSeeded", false);

    const runCollection = await getOrCreateChildCollection(parentCollection, getRunCollectionName(runStartedAt));
    if (!runCollection) {
      return { parentCollection, runCollection: null, includeExistingInRun };
    }

    return { parentCollection, runCollection, includeExistingInRun };
  }

  async function findExistingItem(feedItem, libraryID = null, collectionID = null) {
    if (!feedItem || !feedItem.title) {
      return null;
    }

    const libraries = libraryID
      ? Zotero.Libraries.getAll().filter((l) => l.libraryID === libraryID)
      : Zotero.Libraries.getAll();

    if (feedItem.doi) {
      const normalizedDOI = normalizeDOI(feedItem.doi);

      if (normalizedDOI && typeof Zotero.Items.getByDOI === "function") {
        const byDOI = Zotero.Items.getByDOI(normalizedDOI);
        if (byDOI && byDOI.length > 0) {
          const sameLibrary = byDOI.find((it) => !libraryID || it.libraryID === libraryID);
          if (sameLibrary) {
            return sameLibrary;
          }
        }
      }

      if (normalizedDOI) {
        const foundBySearch = await findExistingBySearch(libraries, "DOI", normalizedDOI);
        if (foundBySearch) {
          return foundBySearch;
        }
      }
    }

    if (typeof Zotero.Items.getByTitle === "function") {
      const byTitle = Zotero.Items.getByTitle(feedItem.title);
      if (byTitle && byTitle.length > 0) {
        const sameLibrary = byTitle.find((it) => {
          if (libraryID && it.libraryID !== libraryID) {
            return false;
          }
          if (!collectionID) {
            return true;
          }
          return isItemInParentHierarchy(it, collectionID);
        });
        if (sameLibrary) {
          return sameLibrary;
        }
      }
    }

    const foundByTitleSearch = await findExistingBySearch(
      libraries,
      "title",
      feedItem.title,
      collectionID ? (it) => isItemInParentHierarchy(it, collectionID) : null
    );
    if (foundByTitleSearch) {
      return foundByTitleSearch;
    }

    return null;
  }

  function isManagedItem(item) {
    if (!item) {
      return false;
    }

    return getExtraFieldValue(item, EXTRA_FIELD_MANAGED) === MANAGED_FLAG_VALUE
        || !!getExtraFieldValue(item, EXTRA_FIELD_SOURCE_KEY);
  }

  function ensureManagedMetadata(item, feedItem) {
    if (!item) {
      return false;
    }

    let changed = false;
    const currentManaged = getExtraFieldValue(item, EXTRA_FIELD_MANAGED);
    if (currentManaged !== MANAGED_FLAG_VALUE) {
      changed = setExtraFieldValue(item, EXTRA_FIELD_MANAGED, MANAGED_FLAG_VALUE) || changed;
    }

    const sourceKey = buildSourceKey(feedItem);
    if (sourceKey && getExtraFieldValue(item, EXTRA_FIELD_SOURCE_KEY) !== sourceKey) {
      changed = setExtraFieldValue(item, EXTRA_FIELD_SOURCE_KEY, sourceKey) || changed;
    }

    if (getExtraFieldValue(item, EXTRA_FIELD_MISSING_SINCE)) {
      changed = setExtraFieldValue(item, EXTRA_FIELD_MISSING_SINCE, "") || changed;
    }

    return changed;
  }

  function isItemInCollection(item, collectionID) {
    if (!item || collectionID == null || typeof item.getCollections !== "function") {
      return false;
    }
    const collections = item.getCollections();
    if (!Array.isArray(collections)) {
      return false;
    }
    const normalizedID = normalizeCollectionId(collectionID);
    return collections.some(function (id) {
      return id === collectionID || normalizeCollectionId(id) === normalizedID;
    });
  }

  function isItemInParentHierarchy(item, parentCollectionID) {
    if (!item || !parentCollectionID || typeof item.getCollections !== "function") {
      return false;
    }

    const collections = item.getCollections();
    if (!Array.isArray(collections) || collections.length === 0) {
      return false;
    }

    return collections.some((collectionID) => isCollectionUnderParent(collectionID, parentCollectionID));
  }

  async function findExistingBySearch(libraries, field, value, predicate = null) {
    if (!value || !libraries || libraries.length === 0) {
      return null;
    }

    try {
      for (const library of libraries) {
        const search = new Zotero.Search();
        search.libraryID = library.libraryID;
        search.addCondition(field, "is", value);
        const ids = await search.search();
        if (ids && ids.length > 0) {
          for (const id of ids) {
            const existing = Zotero.Items.get(id);
            if (!existing) {
              continue;
            }
            if (typeof predicate === "function" && !predicate(existing)) {
              continue;
            }
            return existing;
          }
        }
      }
    } catch (e) {
      log(field + " lookup fallback failed: " + e);
    }

    return null;
  }

  function loadCleanupMissingMap() {
    const raw = getPref("cleanupMissingMap", "{}");
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      log("Invalid cleanupMissingMap JSON, reset to empty: " + e);
      return {};
    }
  }

  function saveCleanupMissingMap(map) {
    setPref("cleanupMissingMap", JSON.stringify(map || {}));
  }

  async function cleanupStaleItems(seenSourceKeys, summary = null) {
    if (!getPref("cleanupEnabled", true)) {
      if (summary) {
        summary.cleanupSkipped = CLEANUP_SKIP_DISABLED;
      }
      log("Cleanup skipped: disabled by user preference");
      return;
    }

    const parentCollection = await getOrCreateParentCollection();
    if (!parentCollection) {
      if (summary) {
        summary.cleanupSkipped = CLEANUP_SKIP_NO_COLLECTION;
      }
      log("Cleanup skipped: parent collection not found");
      return;
    }

    const cleanupDelayDays = getPositiveNumberPref("cleanupDelayDays", 3);
    const cleanupDelayMs = cleanupDelayDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const childItems = getManagedItemsInParentHierarchy(parentCollection);
    log("Cleanup: scanning " + childItems.length + " items in parent hierarchy");

    const missingMap = loadCleanupMissingMap();
    const managedKeys = new Set();
    let markedCount = 0;
    let deletedCount = 0;
    let removedFromParentCount = 0;
    let restoredCount = 0;
    let orphanCount = 0;

    for (const item of childItems) {
      if (!item || (typeof item.isRegularItem === "function" && !item.isRegularItem())) {
        continue;
      }

      if (!isManagedItem(item)) {
        continue;
      }

      const sourceKey = getExtraFieldValue(item, EXTRA_FIELD_SOURCE_KEY);
      if (!sourceKey) {
        // Orphaned managed item: tagged as managed but has no source key.
        // Treat as stale — either remove from hierarchy or delete.
        orphanCount++;
        if (hasExternalCollectionMembership(item, parentCollection)) {
          const removed = await removeItemFromParentHierarchy(item, parentCollection);
          if (removed) {
            removedFromParentCount++;
          }
        } else {
          await item.eraseTx();
          deletedCount++;
        }
        continue;
      }

      managedKeys.add(sourceKey);

      if (seenSourceKeys.has(sourceKey)) {
        if (missingMap[sourceKey]) {
          delete missingMap[sourceKey];
          restoredCount++;
        }

        if (getExtraFieldValue(item, EXTRA_FIELD_MISSING_SINCE)) {
          setExtraFieldValue(item, EXTRA_FIELD_MISSING_SINCE, "");
          await item.saveTx();
        }

        continue;
      }

      let missingSince = Number(missingMap[sourceKey] || 0);

      if (!missingSince) {
        missingSince = now;
        missingMap[sourceKey] = missingSince;
        setExtraFieldValue(item, EXTRA_FIELD_MISSING_SINCE, new Date(missingSince).toISOString());
        await item.saveTx();
        markedCount++;
        log("Cleanup: marked as missing — sourceKey=" + sourceKey + " item=" + (item.key || item.id));
        continue;
      }

      if (now - missingSince >= cleanupDelayMs) {
        if (hasExternalCollectionMembership(item, parentCollection)) {
          const removed = await removeItemFromParentHierarchy(item, parentCollection);
          if (removed) {
            removedFromParentCount++;
            log("Cleanup: removed from parent hierarchy — sourceKey=" + sourceKey);
          } else {
            log("Cleanup: skip deleting item due to failed hierarchy removal — sourceKey=" + sourceKey);
            continue;
          }
        } else {
          await item.eraseTx();
          deletedCount++;
          log("Cleanup: deleted item — sourceKey=" + sourceKey + " missingSince=" + new Date(missingSince).toISOString());
        }
        delete missingMap[sourceKey];
      }
    }

    // Garbage-collect orphan keys in missingMap
    for (const key of Object.keys(missingMap)) {
      if (!managedKeys.has(key) || seenSourceKeys.has(key)) {
        delete missingMap[key];
      }
    }

    saveCleanupMissingMap(missingMap);

    const cleanedCollections = await pruneEmptyManagedCollections(parentCollection);

    log("Cleanup complete: marked=" + markedCount + " restored=" + restoredCount +
        " removedFromParent=" + removedFromParentCount + " deleted=" + deletedCount +
        " orphanCleaned=" + orphanCount + " emptyCollections=" + cleanedCollections);

    if (summary) {
      summary.cleanupMarked = markedCount;
      summary.cleanupDeleted = deletedCount;
      summary.cleanupRemovedFromParent = removedFromParentCount;
      summary.cleanupCollectionsDeleted = cleanedCollections;
      summary.cleanupRestored = restoredCount;
      summary.cleanupOrphanCleaned = orphanCount;
    }
  }

  async function getOrCreateCollection(name, libraryID = null) {
    let targetLibraryID = libraryID;

    if (!targetLibraryID) {
      const libraries = Zotero.Libraries.getAll();
      const library = libraries.find((l) => l.libraryType === "user");

      if (!library) {
        log("No user library found");
        return null;
      }

      targetLibraryID = library.libraryID;
    }

    const collections = Zotero.Collections.getByLibrary(targetLibraryID);
    for (const collection of collections) {
      if (collection.name === name) {
        return collection;
      }
    }

    const newCollection = new Zotero.Collection();
    newCollection.libraryID = targetLibraryID;
    newCollection.name = name;
    await newCollection.saveTx();

    log("Collection created: " + name);
    return newCollection;
  }

  async function getOrCreateChildCollection(parentCollection, childName) {
    if (!parentCollection || !childName) {
      return null;
    }

    const parentID = getCollectionId(parentCollection);
    if (parentID == null) {
      return null;
    }
    const parentIDNorm = String(parentID);
    const childNameNorm = (childName || "").trim();

    const libraryID = parentCollection.libraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID);
    for (const collection of collections) {
      const collectionParentID = collection.parentID != null ? collection.parentID : collection.parentCollectionID;
      const collectionParentIDNorm = collectionParentID != null ? String(collectionParentID) : "";
      if ((collection.name || "").trim() === childNameNorm && collectionParentIDNorm === parentIDNorm) {
        return collection;
      }
    }

    const newCollection = new Zotero.Collection();
    newCollection.libraryID = libraryID;
    newCollection.parentID = parentID;
    newCollection.name = childName;
    await newCollection.saveTx();
    log("Child collection created: " + childName);
    return newCollection;
  }

  function isCollectionUnderParent(collectionID, parentCollectionID) {
    if (collectionID == null || parentCollectionID == null) {
      return false;
    }

    const parentIDNorm = String(parentCollectionID);
    let currentIDRaw = collectionID;
    while (currentIDRaw != null) {
      const currentIDNorm = String(currentIDRaw);
      if (currentIDNorm === parentIDNorm) {
        return true;
      }

      let collection = Zotero.Collections.get(currentIDRaw);
      if (!collection) {
        const asNumber = Number(currentIDRaw);
        if (Number.isFinite(asNumber) && asNumber > 0) {
          collection = Zotero.Collections.get(asNumber);
        }
      }

      if (!collection) {
        break;
      }

      const parentField = collection.parentID != null ? collection.parentID : collection.parentCollectionID;
      currentIDRaw = parentField || null;
    }

    return false;
  }

  function hasExternalCollectionMembership(item, parentCollection) {
    if (!item || !parentCollection || typeof item.getCollections !== "function") {
      return false;
    }

    const parentID = getCollectionId(parentCollection);
    const collections = item.getCollections();
    if (!Array.isArray(collections) || collections.length === 0) {
      return false;
    }

    for (const collectionID of collections) {
      if (collectionID == null || collectionIdsEqual(collectionID, parentID)) {
        continue;
      }

      if (!isCollectionUnderParent(collectionID, parentID)) {
        return true;
      }
    }

    return false;
  }

  async function removeItemFromParentHierarchy(item, parentCollection) {
    if (!item || !parentCollection) {
      return false;
    }

    const current = typeof item.getCollections === "function" ? item.getCollections() : [];
    if (!Array.isArray(current) || current.length === 0) {
      return false;
    }

    const parentID = getCollectionId(parentCollection);
    if (parentID == null) {
      return false;
    }

    const nextCollections = current.filter(function (id) {
      return !isCollectionUnderParent(id, parentID);
    });

    if (nextCollections.length === current.length) {
      return false;
    }

    item.setCollections(nextCollections);
    await item.saveTx();
    return true;
  }

  async function pruneEmptyManagedCollections(parentCollection) {
    if (!parentCollection) {
      return 0;
    }

    const parentID = getCollectionId(parentCollection);
    if (parentID == null) {
      return 0;
    }

    const libraryID = parentCollection.libraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID);
    const descendants = collections.filter(function (collection) {
      const collectionID = getCollectionId(collection);
      return collectionID != null && !collectionIdsEqual(collectionID, parentID)
          && isCollectionUnderParent(collectionID, parentID);
    });

    descendants.sort(function (a, b) {
      return getCollectionDepth(b) - getCollectionDepth(a);
    });

    let deletedCount = 0;
    for (const collection of descendants) {
      const name = (collection.name || "").trim();
      if (!isManagedGeneratedCollectionName(name)) {
        continue;
      }

      if (!isCollectionEffectivelyEmpty(collection)) {
        continue;
      }

      try {
        await collection.eraseTx();
        deletedCount++;
        log("Cleanup: pruned empty collection — \"" + name + "\"");
      } catch (e) {
        log("Cleanup: failed to prune collection \"" + name + "\": " + e);
      }
    }

    return deletedCount;
  }

  function getCollectionDepth(collection) {
    let depth = 0;
    let currentID = collection?.parentID || collection?.parentCollectionID || null;
    while (currentID) {
      depth++;
      const current = Zotero.Collections.get(currentID);
      if (!current) {
        break;
      }
      currentID = current.parentID || current.parentCollectionID || null;
    }
    return depth;
  }

  function isManagedGeneratedCollectionName(name) {
    return RUN_COLLECTION_NAME_PATTERN.test(name);
  }

  function hasManagedRunCollectionsUnderParent(parentCollection) {
    if (!parentCollection) {
      return false;
    }

    const parentID = getCollectionId(parentCollection);
    if (parentID == null) {
      return false;
    }

    const libraryID = parentCollection.libraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID);

    for (const collection of collections) {
      const collectionID = getCollectionId(collection);
      if (collectionID == null || collectionIdsEqual(collectionID, parentID)) {
        continue;
      }

      if (!isCollectionUnderParent(collectionID, parentID)) {
        continue;
      }

      const name = (collection.name || "").trim();
      if (isManagedGeneratedCollectionName(name)) {
        return true;
      }
    }

    return false;
  }

  function isCollectionEffectivelyEmpty(collection) {
    if (!collection) {
      return true;
    }

    const directChildren = typeof collection.getChildCollections === "function" ? collection.getChildCollections() : [];
    if (Array.isArray(directChildren) && directChildren.length > 0) {
      return false;
    }

    const directItems = typeof collection.getChildItems === "function" ? collection.getChildItems() : [];
    return !Array.isArray(directItems) || directItems.length === 0;
  }

  function getManagedItemsInParentHierarchy(parentCollection) {
    if (!parentCollection) {
      return [];
    }

    const parentID = getCollectionId(parentCollection);
    if (parentID == null) {
      return [];
    }

    const libraryID = parentCollection.libraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID);
    const targetCollectionIDs = new Set([parentID]);

    for (const collection of collections) {
      const collectionID = getCollectionId(collection);
      if (collectionID == null || collectionIdsEqual(collectionID, parentID)) {
        continue;
      }

      if (isCollectionUnderParent(collectionID, parentID)) {
        targetCollectionIDs.add(collectionID);
      }
    }

    const itemMap = new Map();
    for (const collectionID of targetCollectionIDs) {
      const collection = Zotero.Collections.get(collectionID);
      if (!collection || typeof collection.getChildItems !== "function") {
        continue;
      }

      const rawItems = collection.getChildItems() || [];
      for (const raw of rawItems) {
        if (raw == null) {
          continue;
        }

        const itemId = typeof raw === "object" && raw !== null
          ? (raw.id || raw.itemID || raw.key)
          : raw;

        const item = Zotero.Items.get(itemId);
        if (!item) {
          continue;
        }

        const dedupKey = item.id || item.itemID || item.key;
        if (dedupKey != null) {
          itemMap.set(String(dedupKey), item);
        }
      }
    }

    return Array.from(itemMap.values());
  }

  // ============ Translation ============

  function getJsonPayload(response) {
    return response?.json || response?.response || response;
  }

  function normalizeLangForFreeAPI(lang, target = false) {
    const value = (lang || "").toLowerCase();
    if (!value || value === "auto") {
      return target ? "zh" : "auto";
    }
    if (value.startsWith("zh")) {
      return "zh";
    }
    if (value.startsWith("en")) {
      return "en";
    }
    return value.split("-")[0] || (target ? "zh" : "auto");
  }

  async function translateFreeGoogle(text, fromLang, toLang) {
    const from = normalizeLangForFreeAPI(fromLang, false);
    const to = normalizeLangForFreeAPI(toLang, true) === "zh" ? "zh-CN" : normalizeLangForFreeAPI(toLang, true);
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}` +
      `&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;

    const response = await Zotero.HTTP.request("GET", url, {
      responseType: "json",
    });

    const json = getJsonPayload(response);
    if (!Array.isArray(json) || !Array.isArray(json[0])) {
      return "";
    }

    let result = "";
    for (const row of json[0]) {
      if (Array.isArray(row) && row[0]) {
        result += row[0];
      }
    }

    return result.trim();
  }

  async function translateFreeBing(text, fromLang, toLang) {
    const from = normalizeLangForFreeAPI(fromLang, false);
    const to = normalizeLangForFreeAPI(toLang, true) === "zh" ? "zh-Hans" : normalizeLangForFreeAPI(toLang, true);

    const tokenResponse = await Zotero.HTTP.request("GET", "https://edge.microsoft.com/translate/auth", {
      responseType: "text",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    const token = tokenResponse?.responseText?.trim();
    if (!token) {
      return "";
    }

    const response = await Zotero.HTTP.request(
      "POST",
      `https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        responseType: "json",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify([{ text }]),
      }
    );

    const json = getJsonPayload(response);
    return json?.[0]?.translations?.[0]?.text || "";
  }

  async function translateFreeHuoshan(text, fromLang, toLang) {
    const response = await Zotero.HTTP.request("POST", "https://translate.volcengine.com/crx/translate/v1", {
      headers: {
        "Content-Type": "application/json",
      },
      responseType: "json",
      body: JSON.stringify({
        source_language: normalizeLangForFreeAPI(fromLang, false),
        target_language: normalizeLangForFreeAPI(toLang, true),
        text,
      }),
    });

    const json = getJsonPayload(response);
    return json?.translation || "";
  }

  async function translateFreeTencent(text, fromLang, toLang) {
    const from = normalizeLangForFreeAPI(fromLang, false);
    const to = normalizeLangForFreeAPI(toLang, true);

    const response = await Zotero.HTTP.request("POST", "https://transmart.qq.com/api/imt", {
      headers: {
        "Content-Type": "application/json",
        referer: "https://transmart.qq.com/zh-CN/index",
      },
      responseType: "json",
      body: JSON.stringify({
        header: {
          fn: "auto_translation",
          client_key: "rssdailytranslator-zotero-client",
        },
        type: "plain",
        model_category: "normal",
        source: {
          lang: from,
          text_list: [text],
        },
        target: {
          lang: to,
        },
      }),
    });

    const json = getJsonPayload(response);
    if (Array.isArray(json?.auto_translation)) {
      return json.auto_translation.join("\n").trim();
    }
    return "";
  }

  async function translateFreeYoudao(text, fromLang, toLang) {
    const from = normalizeLangForFreeAPI(fromLang, false).toUpperCase();
    const to = normalizeLangForFreeAPI(toLang, true).toUpperCase() === "ZH" ? "ZH_CN" : normalizeLangForFreeAPI(toLang, true).toUpperCase();
    const type = `${from}2${to}`;
    const url = `https://fanyi.youdao.com/translate?doctype=json&type=${type}&i=${encodeURIComponent(text)}`;

    const response = await Zotero.HTTP.request("GET", url, {
      responseType: "json",
    });

    const json = getJsonPayload(response);
    const blocks = json?.translateResult;
    if (!Array.isArray(blocks)) {
      return "";
    }

    let result = "";
    for (const row of blocks) {
      if (!Array.isArray(row)) {
        continue;
      }
      for (const cell of row) {
        if (cell?.tgt) {
          result += cell.tgt;
        }
      }
    }
    return result.trim();
  }

  async function translateViaFreeAPIs(text, fromLang = "auto", toLang = "zh") {
    const providers = [
      { name: "google", fn: translateFreeGoogle },
      { name: "bing", fn: translateFreeBing },
      { name: "huoshan", fn: translateFreeHuoshan },
      { name: "tencent", fn: translateFreeTencent },
      { name: "youdao", fn: translateFreeYoudao },
    ];

    for (const provider of providers) {
      try {
        const translated = await provider.fn(text, fromLang, toLang);
        if (translated && translated.trim()) {
          log("Free translation success via: " + provider.name);
          return translated;
        }
      } catch (e) {
        log("Free translation failed via " + provider.name + ": " + e);
      }
    }

    return "";
  }

  async function translateText(text) {
    if (!text) return "";

    if (isChinese(text)) {
      log("Text is already Chinese, skipping translation");
      return text;
    }

    const preferFreeTranslate = !!getPref("preferFreeTranslate", true);
    if (preferFreeTranslate) {
      const freeResult = await translateViaFreeAPIs(text, "auto", "zh");
      if (freeResult) {
        return freeResult;
      }
      log("All free translation providers failed, fallback to configured API");
    }

    const apiKey = getPref("apiKey", "");
    const apiBase = getPref("apiBase", "https://api.openai.com/v1");
    const model = getPref("model", "gpt-4o-mini");

    if (!apiKey) {
      log("No API key configured, returning original text");
      return text;
    }

    try {
      const response = await Zotero.HTTP.request("POST", apiBase + "/chat/completions", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey,
        },
        responseType: "json",
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "Translate the following academic text to Chinese. Keep technical terms in English if appropriate.",
            },
            {
              role: "user",
              content: text,
            },
          ],
          temperature: parseFloat(getPref("temperature", "0.2")),
        }),
      });

      if (response && response.json && response.json.choices) {
        const translated = response.json.choices[0].message.content;
        log("Translation successful");
        return translated;
      }
    } catch (e) {
      log("Translation failed: " + e);
    }

    return text;
  }

  function isChinese(text) {
    const chineseRegex = /[\u4e00-\u9fff]/;
    return chineseRegex.test(text);
  }

  // ============ Prefs Handler ============

  function PrefsHandler() {
    this.save = function (window) {
      try {
        if (getPref("enabled", true)) {
          scheduleNextRun();
        } else {
          clearTimer();
        }

        updateSummaryLabel(window);
        showFeedback(window, "设置已保存", "success");
        log("Settings saved");
      } catch (e) {
        showFeedback(window, "保存失败: " + e.message, "error");
        log("Settings save failed: " + e);
        Zotero.logError(e);
      }
    };

    this.runNow = async function (window) {
      try {
        if (isRunInProgress()) {
          showFeedback(window, "已有任务在执行，请稍后再试", "warning");
          return;
        }

        showFeedback(window, "正在执行，请稍候...", "info");
        log("runNow called from prefs");

        const summary = await runNow("prefs");
        updateSummaryLabel(window);

        const errorCount = summary.errors ? summary.errors.length : 0;
        const feedbackType = errorCount > 0 ? "warning" : "success";
        showFeedback(
          window,
          "执行完成：新增 " + summary.itemsCreated + " 条，更新 " + (summary.itemsUpdated || 0) + " 条，标题翻译 " + (summary.itemsTranslated || 0) + " 条，错误 " + errorCount + " 条",
          feedbackType
        );
      } catch (e) {
        showFeedback(window, "执行失败: " + e.message, "error");
        log("runNow failed from prefs: " + e);
        Zotero.logError(e);
      }
    };

    this.retryNow = async function (window) {
      try {
        showFeedback(window, "正在处理重试队列...", "info");
        const stats = await processRetryQueue();
        const type = stats.failed > 0 ? "warning" : "success";
        showFeedback(
          window,
          "重试完成：成功 " + stats.succeeded + "，失败 " + stats.failed + "，剩余 " + stats.queuedAfter,
          type
        );
        log("Retry queue processed: " + JSON.stringify(stats));
      } catch (e) {
        showFeedback(window, "重试失败: " + e.message, "error");
        log("Retry queue processing failed: " + e);
        Zotero.logError(e);
      }
    };

    this.resetState = async function (window) {
      try {
        setPref("lastSummary", "");
        setPref("lastSummaryText", "");
        setPref("feeds", "");
        setPref("retryQueue", "[]");
        setPref("cleanupMissingMap", "{}");
        setPref("initialBatchSeeded", false);

        if (window && window.document) {
          const feedsInput = window.document.getElementById("zotero-prefpane-rssdaily-feeds");
          const summaryLabel = window.document.getElementById("rssdaily-last-summary-label");
          if (feedsInput) feedsInput.value = "";
          if (summaryLabel) {
            summaryLabel.textContent = "尚未运行";
          }
        }

        showFeedback(window, "状态已重置", "success");
        log("State reset");
      } catch (e) {
        showFeedback(window, "重置失败: " + e.message, "error");
        log("State reset failed: " + e);
        Zotero.logError(e);
      }
    };
  }

  // Initialize plugin
  init();
})();
