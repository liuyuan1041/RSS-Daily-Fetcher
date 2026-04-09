/* eslint-disable no-undef */

/**
 * Bootstrap for RSS Daily Translator
 * Based on Jasminum plugin structure
 */

var chromeHandle;
var gRootURI;

function install(data, reason) { }

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  // String 'rootURI' introduced in Zotero 7
  if (!rootURI) {
    rootURI = resourceURI.spec;
  }

  gRootURI = rootURI;

  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "rssdailytranslator", rootURI + "chrome/content/"],
    ["locale", "rssdailytranslator", "en-US", rootURI + "chrome/locale/en-US/"],
    ["locale", "rssdailytranslator", "zh-CN", rootURI + "chrome/locale/zh-CN/"]
  ]);

  /**
   * Global variables for plugin code.
   */
  const ctx = {
    rootURI,
  };
  ctx._globalThis = ctx;

  Services.scriptloader.loadSubScript(
    `${rootURI}/chrome/content/scripts/jasminum.js`,
    ctx,
  );
  Zotero.RSSDailyTranslator.hooks.onStartup();
}

async function onMainWindowLoad({ window }, reason) {
  Zotero.RSSDailyTranslator?.hooks?.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
  Zotero.RSSDailyTranslator?.hooks?.onMainWindowUnload(window);
}

async function onPrefsWindowLoad({ window }, reason) {
  Zotero.RSSDailyTranslator?.hooks?.onPrefsWindowLoad(window);
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === Components.classes["@mozilla.org/xre/app-info;1"]
    .getService(Components.interfaces.nsIXULRuntime).XPCOM_shutdown) {
    return;
  }

  if (typeof Zotero === "undefined") {
    Zotero = Components.classes["@zotero.org/Zotero;1"].getService(
      Components.interfaces.nsISupports,
    ).wrappedJSObject;
  }
  Zotero.RSSDailyTranslator?.hooks?.onShutdown();

  Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Components.interfaces.nsIStringBundleService)
    .flushBundles();

  if (gRootURI) {
    Cu.unload(`${gRootURI}/chrome/content/scripts/jasminum.js`);
  }

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {
  // Clear all preferences on uninstall
  const PREF_PREFIX = "extensions.zotero.rssdailytranslate.";
  const prefs = Services.prefs.getBranch(PREF_PREFIX);
  const keys = prefs.getChildList("");
  for (const key of keys) {
    prefs.clearUserPref(key);
  }
}
