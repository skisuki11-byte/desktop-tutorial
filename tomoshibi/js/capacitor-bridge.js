(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // node_modules/@capacitor/core/dist/index.js
  var ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor, registerPlugin, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp, SystemBarsStyle, SystemBarType, SystemBarsPluginWeb, SystemBars;
  var init_dist = __esm({
    "node_modules/@capacitor/core/dist/index.js"() {
      (function(ExceptionCode2) {
        ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
        ExceptionCode2["Unavailable"] = "UNAVAILABLE";
      })(ExceptionCode || (ExceptionCode = {}));
      CapacitorException = class extends Error {
        constructor(message, code, data) {
          super(message);
          this.message = message;
          this.code = code;
          this.data = data;
        }
      };
      getPlatformId = (win) => {
        var _a, _b;
        if (win === null || win === void 0 ? void 0 : win.androidBridge) {
          return "android";
        } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
          return "ios";
        } else {
          return "web";
        }
      };
      createCapacitor = (win) => {
        const capCustomPlatform = win.CapacitorCustomPlatform || null;
        const cap = win.Capacitor || {};
        const Plugins = cap.Plugins = cap.Plugins || {};
        const getPlatform = () => {
          return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
        };
        const isNativePlatform = () => getPlatform() !== "web";
        const isPluginAvailable = (pluginName) => {
          const plugin = registeredPlugins.get(pluginName);
          if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
            return true;
          }
          if (getPluginHeader(pluginName)) {
            return true;
          }
          return false;
        };
        const getPluginHeader = (pluginName) => {
          var _a;
          return (_a = cap.PluginHeaders) === null || _a === void 0 ? void 0 : _a.find((h) => h.name === pluginName);
        };
        const handleError = (err) => win.console.error(err);
        const registeredPlugins = /* @__PURE__ */ new Map();
        const registerPlugin2 = (pluginName, jsImplementations = {}) => {
          const registeredPlugin = registeredPlugins.get(pluginName);
          if (registeredPlugin) {
            console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
            return registeredPlugin.proxy;
          }
          const platform = getPlatform();
          const pluginHeader = getPluginHeader(pluginName);
          let jsImplementation;
          const loadPluginImplementation = async () => {
            if (!jsImplementation && platform in jsImplementations) {
              jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
            } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
              jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
            }
            return jsImplementation;
          };
          const createPluginMethod = (impl, prop) => {
            var _a, _b;
            if (pluginHeader) {
              const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
              if (methodHeader) {
                if (methodHeader.rtype === "promise") {
                  return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                } else {
                  return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                }
              } else if (impl) {
                return (_a = impl[prop]) === null || _a === void 0 ? void 0 : _a.bind(impl);
              }
            } else if (impl) {
              return (_b = impl[prop]) === null || _b === void 0 ? void 0 : _b.bind(impl);
            } else {
              throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          };
          const createPluginMethodWrapper = (prop) => {
            let remove;
            const wrapper = (...args) => {
              const p = loadPluginImplementation().then((impl) => {
                const fn = createPluginMethod(impl, prop);
                if (fn) {
                  const p2 = fn(...args);
                  remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                  return p2;
                } else {
                  throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                }
              });
              if (prop === "addListener") {
                p.remove = async () => remove();
              }
              return p;
            };
            wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
            Object.defineProperty(wrapper, "name", {
              value: prop,
              writable: false,
              configurable: false
            });
            return wrapper;
          };
          const addListener = createPluginMethodWrapper("addListener");
          const removeListener = createPluginMethodWrapper("removeListener");
          const addListenerNative = (eventName, callback) => {
            const call = addListener({ eventName }, callback);
            const remove = async () => {
              const callbackId = await call;
              removeListener({
                eventName,
                callbackId
              }, callback);
            };
            const p = new Promise((resolve2) => call.then(() => resolve2({ remove })));
            p.remove = async () => {
              console.warn(`Using addListener() without 'await' is deprecated.`);
              await remove();
            };
            return p;
          };
          const proxy = new Proxy({}, {
            get(_, prop) {
              switch (prop) {
                // https://github.com/facebook/react/issues/20030
                case "$$typeof":
                  return void 0;
                case "toJSON":
                  return () => ({});
                case "addListener":
                  return pluginHeader ? addListenerNative : addListener;
                case "removeListener":
                  return removeListener;
                default:
                  return createPluginMethodWrapper(prop);
              }
            }
          });
          Plugins[pluginName] = proxy;
          registeredPlugins.set(pluginName, {
            name: pluginName,
            proxy,
            platforms: /* @__PURE__ */ new Set([...Object.keys(jsImplementations), ...pluginHeader ? [platform] : []])
          });
          return proxy;
        };
        if (!cap.convertFileSrc) {
          cap.convertFileSrc = (filePath) => filePath;
        }
        cap.getPlatform = getPlatform;
        cap.handleError = handleError;
        cap.isNativePlatform = isNativePlatform;
        cap.isPluginAvailable = isPluginAvailable;
        cap.registerPlugin = registerPlugin2;
        cap.Exception = CapacitorException;
        cap.DEBUG = !!cap.DEBUG;
        cap.isLoggingEnabled = !!cap.isLoggingEnabled;
        return cap;
      };
      initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
      Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      registerPlugin = Capacitor.registerPlugin;
      WebPlugin = class {
        constructor() {
          this.listeners = {};
          this.retainedEventArguments = {};
          this.windowListeners = {};
        }
        addListener(eventName, listenerFunc) {
          let firstListener = false;
          const listeners = this.listeners[eventName];
          if (!listeners) {
            this.listeners[eventName] = [];
            firstListener = true;
          }
          this.listeners[eventName].push(listenerFunc);
          const windowListener = this.windowListeners[eventName];
          if (windowListener && !windowListener.registered) {
            this.addWindowListener(windowListener);
          }
          if (firstListener) {
            this.sendRetainedArgumentsForEvent(eventName);
          }
          const remove = async () => this.removeListener(eventName, listenerFunc);
          const p = Promise.resolve({ remove });
          return p;
        }
        async removeAllListeners() {
          this.listeners = {};
          for (const listener in this.windowListeners) {
            this.removeWindowListener(this.windowListeners[listener]);
          }
          this.windowListeners = {};
        }
        notifyListeners(eventName, data, retainUntilConsumed) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            if (retainUntilConsumed) {
              let args = this.retainedEventArguments[eventName];
              if (!args) {
                args = [];
              }
              args.push(data);
              this.retainedEventArguments[eventName] = args;
            }
            return;
          }
          listeners.forEach((listener) => listener(data));
        }
        hasListeners(eventName) {
          var _a;
          return !!((_a = this.listeners[eventName]) === null || _a === void 0 ? void 0 : _a.length);
        }
        registerWindowListener(windowEventName, pluginEventName) {
          this.windowListeners[pluginEventName] = {
            registered: false,
            windowEventName,
            pluginEventName,
            handler: (event) => {
              this.notifyListeners(pluginEventName, event);
            }
          };
        }
        unimplemented(msg = "not implemented") {
          return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
        }
        unavailable(msg = "not available") {
          return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
        }
        async removeListener(eventName, listenerFunc) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            return;
          }
          const index = listeners.indexOf(listenerFunc);
          if (index !== -1) {
            this.listeners[eventName].splice(index, 1);
          }
          if (!this.listeners[eventName].length) {
            this.removeWindowListener(this.windowListeners[eventName]);
          }
        }
        addWindowListener(handle) {
          window.addEventListener(handle.windowEventName, handle.handler);
          handle.registered = true;
        }
        removeWindowListener(handle) {
          if (!handle) {
            return;
          }
          window.removeEventListener(handle.windowEventName, handle.handler);
          handle.registered = false;
        }
        sendRetainedArgumentsForEvent(eventName) {
          const args = this.retainedEventArguments[eventName];
          if (!args) {
            return;
          }
          delete this.retainedEventArguments[eventName];
          args.forEach((arg) => {
            this.notifyListeners(eventName, arg);
          });
        }
      };
      encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
      decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
      CapacitorCookiesPluginWeb = class extends WebPlugin {
        async getCookies() {
          const cookies = document.cookie;
          const cookieMap = {};
          cookies.split(";").forEach((cookie) => {
            if (cookie.length <= 0)
              return;
            let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
            key = decode(key).trim();
            value = decode(value).trim();
            cookieMap[key] = value;
          });
          return cookieMap;
        }
        async setCookie(options) {
          try {
            const encodedKey = encode(options.key);
            const encodedValue = encode(options.value);
            const expires = options.expires ? `; expires=${options.expires.replace("expires=", "")}` : "";
            const path = (options.path || "/").replace("path=", "");
            const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
            document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async deleteCookie(options) {
          try {
            document.cookie = `${options.key}=; Max-Age=0`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearCookies() {
          try {
            const cookies = document.cookie.split(";") || [];
            for (const cookie of cookies) {
              document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
            }
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearAllCookies() {
          try {
            await this.clearCookies();
          } catch (error) {
            return Promise.reject(error);
          }
        }
      };
      CapacitorCookies = registerPlugin("CapacitorCookies", {
        web: () => new CapacitorCookiesPluginWeb()
      });
      readBlobAsBase64 = async (blob) => new Promise((resolve2, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result;
          resolve2(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
      normalizeHttpHeaders = (headers = {}) => {
        const originalKeys = Object.keys(headers);
        const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
        const normalized = loweredKeys.reduce((acc, key, index) => {
          acc[key] = headers[originalKeys[index]];
          return acc;
        }, {});
        return normalized;
      };
      buildUrlParams = (params, shouldEncode = true) => {
        if (!params)
          return null;
        const output = Object.entries(params).reduce((accumulator, entry) => {
          const [key, value] = entry;
          let encodedValue;
          let item;
          if (Array.isArray(value)) {
            item = "";
            value.forEach((str) => {
              encodedValue = shouldEncode ? encodeURIComponent(str) : str;
              item += `${key}=${encodedValue}&`;
            });
            item.slice(0, -1);
          } else {
            encodedValue = shouldEncode ? encodeURIComponent(value) : value;
            item = `${key}=${encodedValue}`;
          }
          return `${accumulator}&${item}`;
        }, "");
        return output.substr(1);
      };
      buildRequestInit = (options, extra = {}) => {
        const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
        const headers = normalizeHttpHeaders(options.headers);
        const type = headers["content-type"] || "";
        if (typeof options.data === "string") {
          output.body = options.data;
        } else if (type.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(options.data || {})) {
            params.set(key, value);
          }
          output.body = params.toString();
        } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
          const form = new FormData();
          if (options.data instanceof FormData) {
            options.data.forEach((value, key) => {
              form.append(key, value);
            });
          } else {
            for (const key of Object.keys(options.data)) {
              form.append(key, options.data[key]);
            }
          }
          output.body = form;
          const headers2 = new Headers(output.headers);
          headers2.delete("content-type");
          output.headers = headers2;
        } else if (type.includes("application/json") || typeof options.data === "object") {
          output.body = JSON.stringify(options.data);
        }
        return output;
      };
      CapacitorHttpPluginWeb = class extends WebPlugin {
        /**
         * Perform an Http request given a set of options
         * @param options Options to build the HTTP request
         */
        async request(options) {
          const requestInit = buildRequestInit(options, options.webFetchExtra);
          const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
          const url = urlParams ? `${options.url}?${urlParams}` : options.url;
          const response = await fetch(url, requestInit);
          const contentType = response.headers.get("content-type") || "";
          let { responseType = "text" } = response.ok ? options : {};
          if (contentType.includes("application/json")) {
            responseType = "json";
          }
          let data;
          let blob;
          switch (responseType) {
            case "arraybuffer":
            case "blob":
              blob = await response.blob();
              data = await readBlobAsBase64(blob);
              break;
            case "json":
              data = await response.json();
              break;
            case "document":
            case "text":
            default:
              data = await response.text();
          }
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            data,
            headers,
            status: response.status,
            url: response.url
          };
        }
        /**
         * Perform an Http GET request given a set of options
         * @param options Options to build the HTTP request
         */
        async get(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
        }
        /**
         * Perform an Http POST request given a set of options
         * @param options Options to build the HTTP request
         */
        async post(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
        }
        /**
         * Perform an Http PUT request given a set of options
         * @param options Options to build the HTTP request
         */
        async put(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
        }
        /**
         * Perform an Http PATCH request given a set of options
         * @param options Options to build the HTTP request
         */
        async patch(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
        }
        /**
         * Perform an Http DELETE request given a set of options
         * @param options Options to build the HTTP request
         */
        async delete(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
        }
      };
      CapacitorHttp = registerPlugin("CapacitorHttp", {
        web: () => new CapacitorHttpPluginWeb()
      });
      (function(SystemBarsStyle2) {
        SystemBarsStyle2["Dark"] = "DARK";
        SystemBarsStyle2["Light"] = "LIGHT";
        SystemBarsStyle2["Default"] = "DEFAULT";
      })(SystemBarsStyle || (SystemBarsStyle = {}));
      (function(SystemBarType2) {
        SystemBarType2["StatusBar"] = "StatusBar";
        SystemBarType2["NavigationBar"] = "NavigationBar";
      })(SystemBarType || (SystemBarType = {}));
      SystemBarsPluginWeb = class extends WebPlugin {
        async setStyle() {
          this.unavailable("not available for web");
        }
        async setAnimation() {
          this.unavailable("not available for web");
        }
        async show() {
          this.unavailable("not available for web");
        }
        async hide() {
          this.unavailable("not available for web");
        }
      };
      SystemBars = registerPlugin("SystemBars", {
        web: () => new SystemBarsPluginWeb()
      });
    }
  });

  // node_modules/@capacitor/haptics/dist/esm/definitions.js
  var ImpactStyle, NotificationType;
  var init_definitions = __esm({
    "node_modules/@capacitor/haptics/dist/esm/definitions.js"() {
      (function(ImpactStyle2) {
        ImpactStyle2["Heavy"] = "HEAVY";
        ImpactStyle2["Medium"] = "MEDIUM";
        ImpactStyle2["Light"] = "LIGHT";
      })(ImpactStyle || (ImpactStyle = {}));
      (function(NotificationType2) {
        NotificationType2["Success"] = "SUCCESS";
        NotificationType2["Warning"] = "WARNING";
        NotificationType2["Error"] = "ERROR";
      })(NotificationType || (NotificationType = {}));
    }
  });

  // node_modules/@capacitor/haptics/dist/esm/web.js
  var web_exports = {};
  __export(web_exports, {
    HapticsWeb: () => HapticsWeb
  });
  var HapticsWeb;
  var init_web = __esm({
    "node_modules/@capacitor/haptics/dist/esm/web.js"() {
      init_dist();
      init_definitions();
      HapticsWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.selectionStarted = false;
        }
        async impact(options) {
          const pattern = this.patternForImpact(options === null || options === void 0 ? void 0 : options.style);
          this.vibrateWithPattern(pattern);
        }
        async notification(options) {
          const pattern = this.patternForNotification(options === null || options === void 0 ? void 0 : options.type);
          this.vibrateWithPattern(pattern);
        }
        async vibrate(options) {
          const duration = (options === null || options === void 0 ? void 0 : options.duration) || 300;
          this.vibrateWithPattern([duration]);
        }
        async selectionStart() {
          this.selectionStarted = true;
        }
        async selectionChanged() {
          if (this.selectionStarted) {
            this.vibrateWithPattern([70]);
          }
        }
        async selectionEnd() {
          this.selectionStarted = false;
        }
        patternForImpact(style = ImpactStyle.Heavy) {
          if (style === ImpactStyle.Medium) {
            return [43];
          } else if (style === ImpactStyle.Light) {
            return [20];
          }
          return [61];
        }
        patternForNotification(type = NotificationType.Success) {
          if (type === NotificationType.Warning) {
            return [30, 40, 30, 50, 60];
          } else if (type === NotificationType.Error) {
            return [27, 45, 50];
          }
          return [35, 65, 21];
        }
        vibrateWithPattern(pattern) {
          if (navigator.vibrate) {
            navigator.vibrate(pattern);
          } else {
            throw this.unavailable("Browser does not support the vibrate API");
          }
        }
      };
    }
  });

  // node_modules/@capacitor/local-notifications/dist/esm/web.js
  var web_exports2 = {};
  __export(web_exports2, {
    LocalNotificationsWeb: () => LocalNotificationsWeb
  });
  var LocalNotificationsWeb;
  var init_web2 = __esm({
    "node_modules/@capacitor/local-notifications/dist/esm/web.js"() {
      init_dist();
      LocalNotificationsWeb = class extends WebPlugin {
        constructor() {
          super(...arguments);
          this.pending = [];
          this.deliveredNotifications = [];
          this.hasNotificationSupport = () => {
            if (!("Notification" in window) || !Notification.requestPermission) {
              return false;
            }
            if (Notification.permission !== "granted") {
              try {
                new Notification("");
              } catch (e) {
                if (e instanceof Error && e.name === "TypeError") {
                  return false;
                }
              }
            }
            return true;
          };
        }
        async getDeliveredNotifications() {
          const deliveredSchemas = [];
          for (const notification of this.deliveredNotifications) {
            const deliveredSchema = {
              title: notification.title,
              id: parseInt(notification.tag),
              body: notification.body
            };
            deliveredSchemas.push(deliveredSchema);
          }
          return {
            notifications: deliveredSchemas
          };
        }
        async removeDeliveredNotifications(delivered) {
          for (const toRemove of delivered.notifications) {
            const found = this.deliveredNotifications.find((n) => n.tag === String(toRemove.id));
            found === null || found === void 0 ? void 0 : found.close();
            this.deliveredNotifications = this.deliveredNotifications.filter(() => !found);
          }
        }
        async removeDeliveredNotificationsById(options) {
          for (const id of options.ids) {
            const found = this.deliveredNotifications.find((n) => n.tag === String(id));
            found === null || found === void 0 ? void 0 : found.close();
            this.deliveredNotifications = this.deliveredNotifications.filter((n) => n !== found);
          }
        }
        async removeAllDeliveredNotifications() {
          for (const notification of this.deliveredNotifications) {
            notification.close();
          }
          this.deliveredNotifications = [];
        }
        async getByIds(options) {
          const ids = options.ids.map((id) => String(id));
          const scheduled = this.pending.filter((n) => ids.includes(String(n.id)));
          const delivered = this.deliveredNotifications.filter((n) => ids.includes(n.tag)).map((n) => this.deliveredToSchema(n));
          return { notifications: [...scheduled, ...delivered] };
        }
        async getAll(options) {
          const scheduled = [...this.pending];
          const delivered = this.deliveredNotifications.map((n) => this.deliveredToSchema(n));
          if ((options === null || options === void 0 ? void 0 : options.state) === "SCHEDULED") {
            return { notifications: scheduled };
          }
          if ((options === null || options === void 0 ? void 0 : options.state) === "TRIGGERED") {
            return { notifications: delivered };
          }
          return { notifications: [...scheduled, ...delivered] };
        }
        deliveredToSchema(notification) {
          return {
            title: notification.title,
            id: parseInt(notification.tag),
            body: notification.body
          };
        }
        async createChannel() {
          throw this.unimplemented("Not implemented on web.");
        }
        async deleteChannel() {
          throw this.unimplemented("Not implemented on web.");
        }
        async listChannels() {
          throw this.unimplemented("Not implemented on web.");
        }
        async schedule(options) {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          for (const notification of options.notifications) {
            this.sendNotification(notification);
          }
          return {
            notifications: options.notifications.map((notification) => ({
              id: notification.id
            }))
          };
        }
        async update(options) {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          const updated = [];
          for (const notification of options.notifications) {
            const index = this.pending.findIndex((n) => n.id === notification.id);
            if (index === -1) {
              continue;
            }
            this.pending.splice(index, 1);
            this.sendNotification(notification);
            updated.push(notification);
          }
          return {
            notifications: updated.map((notification) => ({ id: notification.id }))
          };
        }
        async getPending() {
          return {
            notifications: this.pending
          };
        }
        async cancelAll() {
          this.pending = [];
        }
        async registerActionTypes() {
          throw this.unimplemented("Not implemented on web.");
        }
        async cancel(pending) {
          this.pending = this.pending.filter((notification) => !pending.notifications.find((n) => n.id === notification.id));
        }
        async areEnabled() {
          const { display } = await this.checkPermissions();
          return {
            value: display === "granted"
          };
        }
        async changeExactNotificationSetting() {
          throw this.unimplemented("Not implemented on web.");
        }
        async checkExactNotificationSetting() {
          throw this.unimplemented("Not implemented on web.");
        }
        async requestPermissions() {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          const display = this.transformNotificationPermission(await Notification.requestPermission());
          return { display };
        }
        async checkPermissions() {
          if (!this.hasNotificationSupport()) {
            throw this.unavailable("Notifications not supported in this browser.");
          }
          const display = this.transformNotificationPermission(Notification.permission);
          return { display };
        }
        transformNotificationPermission(permission) {
          switch (permission) {
            case "granted":
              return "granted";
            case "denied":
              return "denied";
            default:
              return "prompt";
          }
        }
        sendPending() {
          var _a;
          const toRemove = [];
          const now = (/* @__PURE__ */ new Date()).getTime();
          for (const notification of this.pending) {
            if (((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) && notification.schedule.at.getTime() <= now) {
              this.buildNotification(notification);
              toRemove.push(notification);
            }
          }
          this.pending = this.pending.filter((notification) => !toRemove.find((n) => n === notification));
        }
        sendNotification(notification) {
          var _a;
          if ((_a = notification.schedule) === null || _a === void 0 ? void 0 : _a.at) {
            const diff = notification.schedule.at.getTime() - (/* @__PURE__ */ new Date()).getTime();
            this.pending.push(notification);
            setTimeout(() => {
              this.sendPending();
            }, diff);
            return;
          }
          this.buildNotification(notification);
        }
        buildNotification(notification) {
          const localNotification = new Notification(notification.title, {
            body: notification.body,
            tag: String(notification.id)
          });
          localNotification.addEventListener("click", this.onClick.bind(this, notification), false);
          localNotification.addEventListener("show", this.onShow.bind(this, notification), false);
          localNotification.addEventListener("close", () => {
            this.deliveredNotifications = this.deliveredNotifications.filter(() => !this);
          }, false);
          this.deliveredNotifications.push(localNotification);
          return localNotification;
        }
        onClick(notification) {
          const data = {
            actionId: "tap",
            notification
          };
          this.notifyListeners("localNotificationActionPerformed", data);
        }
        onShow(notification) {
          this.notifyListeners("localNotificationReceived", notification);
        }
      };
    }
  });

  // node_modules/@capacitor/splash-screen/dist/esm/web.js
  var web_exports3 = {};
  __export(web_exports3, {
    SplashScreenWeb: () => SplashScreenWeb
  });
  var SplashScreenWeb;
  var init_web3 = __esm({
    "node_modules/@capacitor/splash-screen/dist/esm/web.js"() {
      init_dist();
      SplashScreenWeb = class extends WebPlugin {
        async show(_options) {
          return void 0;
        }
        async hide(_options) {
          return void 0;
        }
      };
    }
  });

  // node_modules/@capacitor/filesystem/dist/esm/definitions.js
  var Directory, Encoding;
  var init_definitions2 = __esm({
    "node_modules/@capacitor/filesystem/dist/esm/definitions.js"() {
      (function(Directory2) {
        Directory2["Documents"] = "DOCUMENTS";
        Directory2["Data"] = "DATA";
        Directory2["Library"] = "LIBRARY";
        Directory2["Cache"] = "CACHE";
        Directory2["External"] = "EXTERNAL";
        Directory2["ExternalStorage"] = "EXTERNAL_STORAGE";
        Directory2["ExternalCache"] = "EXTERNAL_CACHE";
        Directory2["LibraryNoCloud"] = "LIBRARY_NO_CLOUD";
        Directory2["Temporary"] = "TEMPORARY";
      })(Directory || (Directory = {}));
      (function(Encoding2) {
        Encoding2["UTF8"] = "utf8";
        Encoding2["ASCII"] = "ascii";
        Encoding2["UTF16"] = "utf16";
      })(Encoding || (Encoding = {}));
    }
  });

  // node_modules/@capacitor/filesystem/dist/esm/web.js
  var web_exports4 = {};
  __export(web_exports4, {
    FilesystemWeb: () => FilesystemWeb
  });
  function resolve(path) {
    const posix = path.split("/").filter((item) => item !== ".");
    const newPosix = [];
    posix.forEach((item) => {
      if (item === ".." && newPosix.length > 0 && newPosix[newPosix.length - 1] !== "..") {
        newPosix.pop();
      } else {
        newPosix.push(item);
      }
    });
    return newPosix.join("/");
  }
  function isPathParent(parent, children) {
    parent = resolve(parent);
    children = resolve(children);
    const pathsA = parent.split("/");
    const pathsB = children.split("/");
    return parent !== children && pathsA.every((value, index) => value === pathsB[index]);
  }
  var FilesystemWeb;
  var init_web4 = __esm({
    "node_modules/@capacitor/filesystem/dist/esm/web.js"() {
      init_dist();
      init_definitions2();
      FilesystemWeb = class _FilesystemWeb extends WebPlugin {
        constructor() {
          super(...arguments);
          this.DB_VERSION = 1;
          this.DB_NAME = "Disc";
          this._writeCmds = ["add", "put", "delete"];
          this.downloadFile = async (options) => {
            var _a, _b;
            const requestInit = buildRequestInit(options, options.webFetchExtra);
            const response = await fetch(options.url, requestInit);
            let blob;
            if (!options.progress)
              blob = await response.blob();
            else if (!(response === null || response === void 0 ? void 0 : response.body))
              blob = new Blob();
            else {
              const reader = response.body.getReader();
              let bytes = 0;
              const chunks = [];
              const contentType = response.headers.get("content-type");
              const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
              while (true) {
                const { done, value } = await reader.read();
                if (done)
                  break;
                chunks.push(value);
                bytes += (value === null || value === void 0 ? void 0 : value.length) || 0;
                const status = {
                  url: options.url,
                  bytes,
                  contentLength
                };
                this.notifyListeners("progress", status);
              }
              const allChunks = new Uint8Array(bytes);
              let position = 0;
              for (const chunk of chunks) {
                if (typeof chunk === "undefined")
                  continue;
                allChunks.set(chunk, position);
                position += chunk.length;
              }
              blob = new Blob([allChunks.buffer], { type: contentType || void 0 });
            }
            const result = await this.writeFile({
              path: options.path,
              directory: (_a = options.directory) !== null && _a !== void 0 ? _a : void 0,
              recursive: (_b = options.recursive) !== null && _b !== void 0 ? _b : false,
              data: blob
            });
            return { path: result.uri, blob };
          };
        }
        readFileInChunks(_options, _callback) {
          throw this.unavailable("Method not implemented.");
        }
        async initDb() {
          if (this._db !== void 0) {
            return this._db;
          }
          if (!("indexedDB" in window)) {
            throw this.unavailable("This browser doesn't support IndexedDB");
          }
          return new Promise((resolve2, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            request.onupgradeneeded = _FilesystemWeb.doUpgrade;
            request.onsuccess = () => {
              this._db = request.result;
              resolve2(request.result);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
              console.warn("db blocked");
            };
          });
        }
        static doUpgrade(event) {
          const eventTarget = event.target;
          const db = eventTarget.result;
          switch (event.oldVersion) {
            case 0:
            case 1:
            default: {
              if (db.objectStoreNames.contains("FileStorage")) {
                db.deleteObjectStore("FileStorage");
              }
              const store = db.createObjectStore("FileStorage", { keyPath: "path" });
              store.createIndex("by_folder", "folder");
            }
          }
        }
        async dbRequest(cmd, args) {
          const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
          return this.initDb().then((conn) => {
            return new Promise((resolve2, reject) => {
              const tx = conn.transaction(["FileStorage"], readFlag);
              const store = tx.objectStore("FileStorage");
              const req = store[cmd](...args);
              req.onsuccess = () => resolve2(req.result);
              req.onerror = () => reject(req.error);
            });
          });
        }
        async dbIndexRequest(indexName, cmd, args) {
          const readFlag = this._writeCmds.indexOf(cmd) !== -1 ? "readwrite" : "readonly";
          return this.initDb().then((conn) => {
            return new Promise((resolve2, reject) => {
              const tx = conn.transaction(["FileStorage"], readFlag);
              const store = tx.objectStore("FileStorage");
              const index = store.index(indexName);
              const req = index[cmd](...args);
              req.onsuccess = () => resolve2(req.result);
              req.onerror = () => reject(req.error);
            });
          });
        }
        getPath(directory, uriPath) {
          const cleanedUriPath = uriPath !== void 0 ? uriPath.replace(/^[/]+|[/]+$/g, "") : "";
          let fsPath = "";
          if (directory !== void 0)
            fsPath += "/" + directory;
          if (uriPath !== "")
            fsPath += "/" + cleanedUriPath;
          return fsPath;
        }
        async clear() {
          const conn = await this.initDb();
          const tx = conn.transaction(["FileStorage"], "readwrite");
          const store = tx.objectStore("FileStorage");
          store.clear();
        }
        /**
         * Read a file from disk
         * @param options options for the file read
         * @return a promise that resolves with the read file data result
         */
        async readFile(options) {
          const path = this.getPath(options.directory, options.path);
          const entry = await this.dbRequest("get", [path]);
          if (entry === void 0)
            throw Error("File does not exist.");
          return { data: entry.content ? entry.content : "" };
        }
        /**
         * Write a file to disk in the specified location on device
         * @param options options for the file write
         * @return a promise that resolves with the file write result
         */
        async writeFile(options) {
          const path = this.getPath(options.directory, options.path);
          let data = options.data;
          const encoding = options.encoding;
          const doRecursive = options.recursive;
          const occupiedEntry = await this.dbRequest("get", [path]);
          if (occupiedEntry && occupiedEntry.type === "directory")
            throw Error("The supplied path is a directory.");
          const parentPath = path.substr(0, path.lastIndexOf("/"));
          const parentEntry = await this.dbRequest("get", [parentPath]);
          if (parentEntry === void 0) {
            const subDirIndex = parentPath.indexOf("/", 1);
            if (subDirIndex !== -1) {
              const parentArgPath = parentPath.substr(subDirIndex);
              await this.mkdir({
                path: parentArgPath,
                directory: options.directory,
                recursive: doRecursive
              });
            }
          }
          if (!encoding && !(data instanceof Blob)) {
            data = data.indexOf(",") >= 0 ? data.split(",")[1] : data;
            if (!this.isBase64String(data))
              throw Error("The supplied data is not valid base64 content.");
          }
          const now = Date.now();
          const pathObj = {
            path,
            folder: parentPath,
            type: "file",
            size: data instanceof Blob ? data.size : data.length,
            ctime: now,
            mtime: now,
            content: data
          };
          await this.dbRequest("put", [pathObj]);
          return {
            uri: pathObj.path
          };
        }
        /**
         * Append to a file on disk in the specified location on device
         * @param options options for the file append
         * @return a promise that resolves with the file write result
         */
        async appendFile(options) {
          const path = this.getPath(options.directory, options.path);
          let data = options.data;
          const encoding = options.encoding;
          const parentPath = path.substr(0, path.lastIndexOf("/"));
          const now = Date.now();
          let ctime = now;
          const occupiedEntry = await this.dbRequest("get", [path]);
          if (occupiedEntry && occupiedEntry.type === "directory")
            throw Error("The supplied path is a directory.");
          const parentEntry = await this.dbRequest("get", [parentPath]);
          if (parentEntry === void 0) {
            const subDirIndex = parentPath.indexOf("/", 1);
            if (subDirIndex !== -1) {
              const parentArgPath = parentPath.substr(subDirIndex);
              await this.mkdir({
                path: parentArgPath,
                directory: options.directory,
                recursive: true
              });
            }
          }
          if (!encoding && !this.isBase64String(data))
            throw Error("The supplied data is not valid base64 content.");
          if (occupiedEntry !== void 0) {
            if (occupiedEntry.content instanceof Blob) {
              throw Error("The occupied entry contains a Blob object which cannot be appended to.");
            }
            if (occupiedEntry.content !== void 0 && !encoding) {
              data = btoa(atob(occupiedEntry.content) + atob(data));
            } else {
              data = occupiedEntry.content + data;
            }
            ctime = occupiedEntry.ctime;
          }
          const pathObj = {
            path,
            folder: parentPath,
            type: "file",
            size: data.length,
            ctime,
            mtime: now,
            content: data
          };
          await this.dbRequest("put", [pathObj]);
        }
        /**
         * Delete a file from disk
         * @param options options for the file delete
         * @return a promise that resolves with the deleted file data result
         */
        async deleteFile(options) {
          const path = this.getPath(options.directory, options.path);
          const entry = await this.dbRequest("get", [path]);
          if (entry === void 0)
            throw Error("File does not exist.");
          const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
          if (entries.length !== 0)
            throw Error("Folder is not empty.");
          await this.dbRequest("delete", [path]);
        }
        /**
         * Create a directory.
         * @param options options for the mkdir
         * @return a promise that resolves with the mkdir result
         */
        async mkdir(options) {
          const path = this.getPath(options.directory, options.path);
          const doRecursive = options.recursive;
          const parentPath = path.substr(0, path.lastIndexOf("/"));
          const depth = (path.match(/\//g) || []).length;
          const parentEntry = await this.dbRequest("get", [parentPath]);
          const occupiedEntry = await this.dbRequest("get", [path]);
          if (depth === 1)
            throw Error("Cannot create Root directory");
          if (occupiedEntry !== void 0)
            throw Error("Current directory does already exist.");
          if (!doRecursive && depth !== 2 && parentEntry === void 0)
            throw Error("Parent directory must exist");
          if (doRecursive && depth !== 2 && parentEntry === void 0) {
            const parentArgPath = parentPath.substr(parentPath.indexOf("/", 1));
            await this.mkdir({
              path: parentArgPath,
              directory: options.directory,
              recursive: doRecursive
            });
          }
          const now = Date.now();
          const pathObj = {
            path,
            folder: parentPath,
            type: "directory",
            size: 0,
            ctime: now,
            mtime: now
          };
          await this.dbRequest("put", [pathObj]);
        }
        /**
         * Remove a directory
         * @param options the options for the directory remove
         */
        async rmdir(options) {
          const { path, directory, recursive } = options;
          const fullPath = this.getPath(directory, path);
          const entry = await this.dbRequest("get", [fullPath]);
          if (entry === void 0)
            throw Error("Folder does not exist.");
          if (entry.type !== "directory")
            throw Error("Requested path is not a directory");
          const readDirResult = await this.readdir({ path, directory });
          if (readDirResult.files.length !== 0 && !recursive)
            throw Error("Folder is not empty");
          for (const entry2 of readDirResult.files) {
            const entryPath = `${path}/${entry2.name}`;
            const entryObj = await this.stat({ path: entryPath, directory });
            if (entryObj.type === "file") {
              await this.deleteFile({ path: entryPath, directory });
            } else {
              await this.rmdir({ path: entryPath, directory, recursive });
            }
          }
          await this.dbRequest("delete", [fullPath]);
        }
        /**
         * Return a list of files from the directory (not recursive)
         * @param options the options for the readdir operation
         * @return a promise that resolves with the readdir directory listing result
         */
        async readdir(options) {
          const path = this.getPath(options.directory, options.path);
          const entry = await this.dbRequest("get", [path]);
          if (options.path !== "" && entry === void 0)
            throw Error("Folder does not exist.");
          const entries = await this.dbIndexRequest("by_folder", "getAllKeys", [IDBKeyRange.only(path)]);
          const files = await Promise.all(entries.map(async (e) => {
            let subEntry = await this.dbRequest("get", [e]);
            if (subEntry === void 0) {
              subEntry = await this.dbRequest("get", [e + "/"]);
            }
            return {
              name: e.substring(path.length + 1),
              type: subEntry.type,
              size: subEntry.size,
              ctime: subEntry.ctime,
              mtime: subEntry.mtime,
              uri: subEntry.path
            };
          }));
          return { files };
        }
        /**
         * Return full File URI for a path and directory
         * @param options the options for the stat operation
         * @return a promise that resolves with the file stat result
         */
        async getUri(options) {
          const path = this.getPath(options.directory, options.path);
          let entry = await this.dbRequest("get", [path]);
          if (entry === void 0) {
            entry = await this.dbRequest("get", [path + "/"]);
          }
          return {
            uri: (entry === null || entry === void 0 ? void 0 : entry.path) || path
          };
        }
        /**
         * Return data about a file
         * @param options the options for the stat operation
         * @return a promise that resolves with the file stat result
         */
        async stat(options) {
          const path = this.getPath(options.directory, options.path);
          let entry = await this.dbRequest("get", [path]);
          if (entry === void 0) {
            entry = await this.dbRequest("get", [path + "/"]);
          }
          if (entry === void 0)
            throw Error("Entry does not exist.");
          return {
            name: entry.path.substring(path.length + 1),
            type: entry.type,
            size: entry.size,
            ctime: entry.ctime,
            mtime: entry.mtime,
            uri: entry.path
          };
        }
        /**
         * Rename a file or directory
         * @param options the options for the rename operation
         * @return a promise that resolves with the rename result
         */
        async rename(options) {
          await this._copy(options, true);
          return;
        }
        /**
         * Copy a file or directory
         * @param options the options for the copy operation
         * @return a promise that resolves with the copy result
         */
        async copy(options) {
          return this._copy(options, false);
        }
        async requestPermissions() {
          return { publicStorage: "granted" };
        }
        async checkPermissions() {
          return { publicStorage: "granted" };
        }
        /**
         * Function that can perform a copy or a rename
         * @param options the options for the rename operation
         * @param doRename whether to perform a rename or copy operation
         * @return a promise that resolves with the result
         */
        async _copy(options, doRename = false) {
          let { toDirectory } = options;
          const { to, from, directory: fromDirectory } = options;
          if (!to || !from) {
            throw Error("Both to and from must be provided");
          }
          if (!toDirectory) {
            toDirectory = fromDirectory;
          }
          const fromPath = this.getPath(fromDirectory, from);
          const toPath = this.getPath(toDirectory, to);
          if (fromPath === toPath) {
            return {
              uri: toPath
            };
          }
          if (isPathParent(fromPath, toPath)) {
            throw Error("To path cannot contain the from path");
          }
          let toObj;
          try {
            toObj = await this.stat({
              path: to,
              directory: toDirectory
            });
          } catch (e) {
            const toPathComponents = to.split("/");
            toPathComponents.pop();
            const toPath2 = toPathComponents.join("/");
            if (toPathComponents.length > 0) {
              const toParentDirectory = await this.stat({
                path: toPath2,
                directory: toDirectory
              });
              if (toParentDirectory.type !== "directory") {
                throw new Error("Parent directory of the to path is a file");
              }
            }
          }
          if (toObj && toObj.type === "directory") {
            throw new Error("Cannot overwrite a directory with a file");
          }
          const fromObj = await this.stat({
            path: from,
            directory: fromDirectory
          });
          const updateTime = async (path, ctime2, mtime) => {
            const fullPath = this.getPath(toDirectory, path);
            const entry = await this.dbRequest("get", [fullPath]);
            entry.ctime = ctime2;
            entry.mtime = mtime;
            await this.dbRequest("put", [entry]);
          };
          const ctime = fromObj.ctime ? fromObj.ctime : Date.now();
          switch (fromObj.type) {
            // The "from" object is a file
            case "file": {
              const file = await this.readFile({
                path: from,
                directory: fromDirectory
              });
              if (doRename) {
                await this.deleteFile({
                  path: from,
                  directory: fromDirectory
                });
              }
              let encoding;
              if (!(file.data instanceof Blob) && !this.isBase64String(file.data)) {
                encoding = Encoding.UTF8;
              }
              const writeResult = await this.writeFile({
                path: to,
                directory: toDirectory,
                data: file.data,
                encoding
              });
              if (doRename) {
                await updateTime(to, ctime, fromObj.mtime);
              }
              return writeResult;
            }
            case "directory": {
              if (toObj) {
                throw Error("Cannot move a directory over an existing object");
              }
              try {
                await this.mkdir({
                  path: to,
                  directory: toDirectory,
                  recursive: false
                });
                if (doRename) {
                  await updateTime(to, ctime, fromObj.mtime);
                }
              } catch (e) {
              }
              const contents = (await this.readdir({
                path: from,
                directory: fromDirectory
              })).files;
              for (const filename of contents) {
                await this._copy({
                  from: `${from}/${filename.name}`,
                  to: `${to}/${filename.name}`,
                  directory: fromDirectory,
                  toDirectory
                }, doRename);
              }
              if (doRename) {
                await this.rmdir({
                  path: from,
                  directory: fromDirectory
                });
              }
            }
          }
          return {
            uri: toPath
          };
        }
        isBase64String(str) {
          try {
            return btoa(atob(str)) == str;
          } catch (err) {
            return false;
          }
        }
      };
      FilesystemWeb._debug = true;
    }
  });

  // node_modules/@capacitor/share/dist/esm/web.js
  var web_exports5 = {};
  __export(web_exports5, {
    ShareWeb: () => ShareWeb
  });
  var ShareWeb;
  var init_web5 = __esm({
    "node_modules/@capacitor/share/dist/esm/web.js"() {
      init_dist();
      ShareWeb = class extends WebPlugin {
        async canShare() {
          if (typeof navigator === "undefined" || !navigator.share) {
            return { value: false };
          } else {
            return { value: true };
          }
        }
        async share(options) {
          if (typeof navigator === "undefined" || !navigator.share) {
            throw this.unavailable("Share API not available in this browser");
          }
          await navigator.share({
            title: options.title,
            text: options.text,
            url: options.url
          });
          return {};
        }
      };
    }
  });

  // node_modules/@capacitor/calendar/dist/esm/web.js
  var web_exports6 = {};
  __export(web_exports6, {
    CalendarWeb: () => CalendarWeb
  });
  var CalendarWeb;
  var init_web6 = __esm({
    "node_modules/@capacitor/calendar/dist/esm/web.js"() {
      init_dist();
      CalendarWeb = class extends WebPlugin {
        async checkPermissions() {
          throw this.unimplemented("Not implemented on web.");
        }
        async requestPermissions(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async createEvent(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async createEventInteractively(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async modifyEvent(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async findEvents(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async deleteEvent(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async listCalendars() {
          throw this.unimplemented("Not implemented on web.");
        }
        async createCalendar(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async deleteCalendar(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
        async openCalendar(_options) {
          throw this.unimplemented("Not implemented on web.");
        }
      };
    }
  });

  // capacitor-src/bridge.js
  init_dist();

  // node_modules/@capacitor/haptics/dist/esm/index.js
  init_dist();
  init_definitions();
  var Haptics = registerPlugin("Haptics", {
    web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.HapticsWeb())
  });

  // node_modules/@capacitor/local-notifications/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/local-notifications/dist/esm/definitions.js
  var Weekday;
  (function(Weekday2) {
    Weekday2[Weekday2["Sunday"] = 1] = "Sunday";
    Weekday2[Weekday2["Monday"] = 2] = "Monday";
    Weekday2[Weekday2["Tuesday"] = 3] = "Tuesday";
    Weekday2[Weekday2["Wednesday"] = 4] = "Wednesday";
    Weekday2[Weekday2["Thursday"] = 5] = "Thursday";
    Weekday2[Weekday2["Friday"] = 6] = "Friday";
    Weekday2[Weekday2["Saturday"] = 7] = "Saturday";
  })(Weekday || (Weekday = {}));

  // node_modules/@capacitor/local-notifications/dist/esm/index.js
  var LocalNotifications = registerPlugin("LocalNotifications", {
    web: () => Promise.resolve().then(() => (init_web2(), web_exports2)).then((m) => new m.LocalNotificationsWeb())
  });

  // node_modules/@capacitor/camera/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/camera/dist/esm/web.js
  init_dist();

  // node_modules/@capacitor/camera/dist/esm/definitions.js
  var CameraSource;
  (function(CameraSource2) {
    CameraSource2["Prompt"] = "PROMPT";
    CameraSource2["Camera"] = "CAMERA";
    CameraSource2["Photos"] = "PHOTOS";
  })(CameraSource || (CameraSource = {}));
  var CameraDirection;
  (function(CameraDirection2) {
    CameraDirection2["Rear"] = "REAR";
    CameraDirection2["Front"] = "FRONT";
  })(CameraDirection || (CameraDirection = {}));
  var CameraResultType;
  (function(CameraResultType2) {
    CameraResultType2["Uri"] = "uri";
    CameraResultType2["Base64"] = "base64";
    CameraResultType2["DataUrl"] = "dataUrl";
  })(CameraResultType || (CameraResultType = {}));
  var MediaType;
  (function(MediaType2) {
    MediaType2[MediaType2["Photo"] = 0] = "Photo";
    MediaType2[MediaType2["Video"] = 1] = "Video";
  })(MediaType || (MediaType = {}));
  var MediaTypeSelection;
  (function(MediaTypeSelection2) {
    MediaTypeSelection2[MediaTypeSelection2["Photo"] = 0] = "Photo";
    MediaTypeSelection2[MediaTypeSelection2["Video"] = 1] = "Video";
    MediaTypeSelection2[MediaTypeSelection2["All"] = 2] = "All";
  })(MediaTypeSelection || (MediaTypeSelection = {}));
  var EncodingType;
  (function(EncodingType2) {
    EncodingType2[EncodingType2["JPEG"] = 0] = "JPEG";
    EncodingType2[EncodingType2["PNG"] = 1] = "PNG";
  })(EncodingType || (EncodingType = {}));
  var CameraErrorCode;
  (function(CameraErrorCode2) {
    CameraErrorCode2["CameraPermissionDenied"] = "OS-PLUG-CAMR-0003";
    CameraErrorCode2["GalleryPermissionDenied"] = "OS-PLUG-CAMR-0005";
    CameraErrorCode2["NoCameraAvailable"] = "OS-PLUG-CAMR-0007";
    CameraErrorCode2["TakePhotoCancelled"] = "OS-PLUG-CAMR-0006";
    CameraErrorCode2["TakePhotoFailed"] = "OS-PLUG-CAMR-0010";
    CameraErrorCode2["TakePhotoInvalidArguments"] = "OS-PLUG-CAMR-0014";
    CameraErrorCode2["InvalidImageData"] = "OS-PLUG-CAMR-0008";
    CameraErrorCode2["EditPhotoFailed"] = "OS-PLUG-CAMR-0009";
    CameraErrorCode2["EditPhotoCancelled"] = "OS-PLUG-CAMR-0013";
    CameraErrorCode2["EditPhotoEmptyUri"] = "OS-PLUG-CAMR-0024";
    CameraErrorCode2["ImageNotFound"] = "OS-PLUG-CAMR-0011";
    CameraErrorCode2["ProcessImageFailed"] = "OS-PLUG-CAMR-0012";
    CameraErrorCode2["ChooseMediaFailed"] = "OS-PLUG-CAMR-0018";
    CameraErrorCode2["ChooseMediaCancelled"] = "OS-PLUG-CAMR-0020";
    CameraErrorCode2["MediaPathError"] = "OS-PLUG-CAMR-0021";
    CameraErrorCode2["FetchImageFromUriFailed"] = "OS-PLUG-CAMR-0028";
    CameraErrorCode2["RecordVideoFailed"] = "OS-PLUG-CAMR-0016";
    CameraErrorCode2["RecordVideoCancelled"] = "OS-PLUG-CAMR-0017";
    CameraErrorCode2["VideoNotFound"] = "OS-PLUG-CAMR-0025";
    CameraErrorCode2["PlayVideoFailed"] = "OS-PLUG-CAMR-0023";
    CameraErrorCode2["EncodeResultFailed"] = "OS-PLUG-CAMR-0019";
    CameraErrorCode2["FileNotFound"] = "OS-PLUG-CAMR-0027";
    CameraErrorCode2["InvalidArgument"] = "OS-PLUG-CAMR-0031";
    CameraErrorCode2["GeneralError"] = "OS-PLUG-CAMR-0026";
  })(CameraErrorCode || (CameraErrorCode = {}));

  // node_modules/@capacitor/camera/dist/esm/web.js
  var CameraWeb = class extends WebPlugin {
    async takePhoto(options) {
      return new Promise(async (resolve2, reject) => {
        if (options.webUseInput) {
          this.takePhotoCameraInputExperience(options, resolve2, reject);
        } else {
          this.takePhotoCameraExperience(options, resolve2, reject);
        }
      });
    }
    async recordVideo(_options) {
      throw this.unimplemented("recordVideo is not implemented on Web.");
    }
    async playVideo(_options) {
      throw this.unimplemented("playVideo is not implemented on Web.");
    }
    async chooseFromGallery(options) {
      return new Promise(async (resolve2, reject) => {
        this.galleryInputExperience(options, resolve2, reject);
      });
    }
    async editPhoto(_options) {
      throw this.unimplemented("editPhoto is not implemented on Web.");
    }
    async editURIPhoto(_options) {
      throw this.unimplemented("editURIPhoto is not implemented on Web.");
    }
    async getPhoto(options) {
      return new Promise(async (resolve2, reject) => {
        if (options.webUseInput || options.source === CameraSource.Photos) {
          this.fileInputExperience(options, resolve2, reject);
        } else if (options.source === CameraSource.Prompt) {
          let actionSheet = document.querySelector("pwa-action-sheet");
          if (!actionSheet) {
            actionSheet = document.createElement("pwa-action-sheet");
            document.body.appendChild(actionSheet);
          }
          actionSheet.header = options.promptLabelHeader || "Photo";
          actionSheet.cancelable = false;
          actionSheet.options = [
            { title: options.promptLabelPhoto || "From Photos" },
            { title: options.promptLabelPicture || "Take Picture" }
          ];
          actionSheet.addEventListener("onSelection", async (e) => {
            const selection = e.detail;
            if (selection === 0) {
              this.fileInputExperience(options, resolve2, reject);
            } else {
              this.cameraExperience(options, resolve2, reject);
            }
          });
        } else {
          this.cameraExperience(options, resolve2, reject);
        }
      });
    }
    async pickImages(_options) {
      return new Promise(async (resolve2, reject) => {
        this.multipleFileInputExperience(resolve2, reject);
      });
    }
    async cameraExperience(options, resolve2, reject) {
      await this._setupPWACameraModal(options.direction, (photo) => this._getCameraPhoto(photo, options), () => this.fileInputExperience(options, resolve2, reject), resolve2, reject);
    }
    fileInputExperience(options, resolve2, reject) {
      let input = document.querySelector("#_capacitor-camera-input");
      const cleanup = () => {
        var _a;
        (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
      };
      if (!input) {
        input = document.createElement("input");
        input.id = "_capacitor-camera-input";
        input.type = "file";
        input.hidden = true;
        document.body.appendChild(input);
        input.addEventListener("change", (_e) => {
          const file = input.files[0];
          let format = "jpeg";
          if (file.type === "image/png") {
            format = "png";
          } else if (file.type === "image/gif") {
            format = "gif";
          }
          if (options.resultType === "dataUrl" || options.resultType === "base64") {
            const reader = new FileReader();
            reader.addEventListener("load", () => {
              if (options.resultType === "dataUrl") {
                resolve2({
                  dataUrl: reader.result,
                  format
                });
              } else if (options.resultType === "base64") {
                const b64 = reader.result.split(",")[1];
                resolve2({
                  base64String: b64,
                  format
                });
              }
              cleanup();
            });
            reader.readAsDataURL(file);
          } else {
            resolve2({
              webPath: URL.createObjectURL(file),
              format
            });
            cleanup();
          }
        });
        input.addEventListener("cancel", (_e) => {
          reject(new CapacitorException("User cancelled photos app"));
          cleanup();
        });
      }
      input.accept = "image/*";
      input.capture = true;
      if (options.source === CameraSource.Photos || options.source === CameraSource.Prompt) {
        input.removeAttribute("capture");
      } else if (options.direction === CameraDirection.Front) {
        input.capture = "user";
      } else if (options.direction === CameraDirection.Rear) {
        input.capture = "environment";
      }
      input.click();
    }
    multipleFileInputExperience(resolve2, reject) {
      let input = document.querySelector("#_capacitor-camera-input-multiple");
      const cleanup = () => {
        var _a;
        (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
      };
      if (!input) {
        input = document.createElement("input");
        input.id = "_capacitor-camera-input-multiple";
        input.type = "file";
        input.hidden = true;
        input.multiple = true;
        document.body.appendChild(input);
        input.addEventListener("change", (_e) => {
          const photos = [];
          for (let i = 0; i < input.files.length; i++) {
            const file = input.files[i];
            let format = "jpeg";
            if (file.type === "image/png") {
              format = "png";
            } else if (file.type === "image/gif") {
              format = "gif";
            }
            photos.push({
              webPath: URL.createObjectURL(file),
              format
            });
          }
          resolve2({ photos });
          cleanup();
        });
        input.addEventListener("cancel", (_e) => {
          reject(new CapacitorException("User cancelled photos app"));
          cleanup();
        });
      }
      input.accept = "image/*";
      input.click();
    }
    _getCameraPhoto(photo, options) {
      return new Promise((resolve2, reject) => {
        const reader = new FileReader();
        const format = this._getFileFormat(photo);
        if (options.resultType === "uri") {
          resolve2({
            webPath: URL.createObjectURL(photo),
            format,
            saved: false
          });
        } else {
          reader.readAsDataURL(photo);
          reader.onloadend = () => {
            const r = reader.result;
            if (options.resultType === "dataUrl") {
              resolve2({
                dataUrl: r,
                format,
                saved: false
              });
            } else {
              resolve2({
                base64String: r.split(",")[1],
                format,
                saved: false
              });
            }
          };
          reader.onerror = (e) => {
            reject(e);
          };
        }
      });
    }
    async takePhotoCameraExperience(options, resolve2, reject) {
      await this._setupPWACameraModal(options.cameraDirection, (photo) => {
        var _a;
        return this._buildPhotoMediaResult(photo, (_a = options.includeMetadata) !== null && _a !== void 0 ? _a : false);
      }, () => this.takePhotoCameraInputExperience(options, resolve2, reject), resolve2, reject);
    }
    takePhotoCameraInputExperience(options, resolve2, reject) {
      const input = this._createFileInput("_capacitor-camera-input-takephoto");
      const cleanup = () => {
        var _a;
        (_a = input.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(input);
      };
      input.onchange = async (_e) => {
        var _a;
        if (!this._validateFileInput(input, reject, cleanup)) {
          return;
        }
        const file = input.files[0];
        resolve2(await this._buildPhotoMediaResult(file, (_a = options.includeMetadata) !== null && _a !== void 0 ? _a : false));
        cleanup();
      };
      input.oncancel = () => {
        reject(new CapacitorException("User cancelled photos app"));
        cleanup();
      };
      input.accept = "image/*";
      if (options.cameraDirection === CameraDirection.Front) {
        input.capture = "user";
      } else {
        input.capture = "environment";
      }
      input.click();
    }
    galleryInputExperience(options, resolve2, reject) {
      var _a, _b;
      const input = this._createFileInput("_capacitor-camera-input-gallery");
      input.multiple = (_a = options.allowMultipleSelection) !== null && _a !== void 0 ? _a : false;
      const cleanup = () => {
        var _a2;
        (_a2 = input.parentNode) === null || _a2 === void 0 ? void 0 : _a2.removeChild(input);
      };
      input.onchange = async (_e) => {
        var _a2;
        if (!this._validateFileInput(input, reject, cleanup)) {
          return;
        }
        const results = [];
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          if (file.type.startsWith("image/")) {
            results.push(await this._buildPhotoMediaResult(file, (_a2 = options.includeMetadata) !== null && _a2 !== void 0 ? _a2 : false));
          } else if (file.type.startsWith("video/")) {
            const format = this._getFileFormat(file);
            let thumbnail;
            let resolution;
            let duration;
            try {
              const videoInfo = await this._getVideoMetadata(file);
              thumbnail = videoInfo.thumbnail;
              if (options.includeMetadata) {
                resolution = videoInfo.resolution;
                duration = videoInfo.duration;
              }
            } catch (e) {
              console.warn("Failed to get video metadata:", e);
            }
            const result = {
              type: MediaType.Video,
              thumbnail,
              webPath: URL.createObjectURL(file),
              saved: false
            };
            if (options.includeMetadata) {
              result.metadata = {
                format,
                resolution,
                size: file.size,
                creationDate: new Date(file.lastModified).toISOString(),
                duration
              };
            }
            results.push(result);
          }
        }
        resolve2({ results });
        cleanup();
      };
      input.oncancel = () => {
        reject(new CapacitorException("User cancelled photos app"));
        cleanup();
      };
      const mediaType = (_b = options.mediaType) !== null && _b !== void 0 ? _b : MediaTypeSelection.Photo;
      if (mediaType === MediaTypeSelection.Photo) {
        input.accept = "image/*";
      } else if (mediaType === MediaTypeSelection.Video) {
        input.accept = "video/*";
      } else {
        input.accept = "image/*,video/*";
      }
      input.click();
    }
    _getFileFormat(file) {
      if (file.type === "image/png") {
        return "png";
      } else if (file.type === "image/gif") {
        return "gif";
      } else if (file.type.startsWith("video/")) {
        return file.type.split("/")[1];
      } else if (file.type.startsWith("image/")) {
        return "jpeg";
      }
      return file.type.split("/")[1] || "jpeg";
    }
    async _buildPhotoMediaResult(file, includeMetadata) {
      const format = this._getFileFormat(file);
      const thumbnail = await this._getBase64FromFile(file);
      const result = {
        type: MediaType.Photo,
        thumbnail,
        webPath: URL.createObjectURL(file),
        saved: false
      };
      if (includeMetadata) {
        const resolution = await this._getImageResolution(file);
        result.metadata = {
          format,
          resolution,
          size: file.size,
          creationDate: "lastModified" in file ? new Date(file.lastModified).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
        };
      }
      return result;
    }
    _validateFileInput(input, reject, cleanup) {
      if (!input.files || input.files.length === 0) {
        const message = input.multiple ? "No files selected" : "No file selected";
        reject(new CapacitorException(message));
        cleanup();
        return false;
      }
      return true;
    }
    async _setupPWACameraModal(cameraDirection, onPhotoCallback, fallbackCallback, resolve2, reject) {
      if (customElements.get("pwa-camera-modal")) {
        const cameraModal = document.createElement("pwa-camera-modal");
        cameraModal.facingMode = cameraDirection === CameraDirection.Front ? "user" : "environment";
        document.body.appendChild(cameraModal);
        try {
          await cameraModal.componentOnReady();
          cameraModal.addEventListener("onPhoto", async (e) => {
            const photo = e.detail;
            if (photo === null) {
              reject(new CapacitorException("User cancelled photos app"));
            } else if (photo instanceof Error) {
              reject(photo);
            } else {
              resolve2(await onPhotoCallback(photo));
            }
            cameraModal.dismiss();
            document.body.removeChild(cameraModal);
          });
          cameraModal.present();
        } catch (e) {
          fallbackCallback();
        }
      } else {
        console.error(`Unable to load PWA Element 'pwa-camera-modal'. See the docs: https://capacitorjs.com/docs/web/pwa-elements.`);
        fallbackCallback();
      }
    }
    _createFileInput(id) {
      let input = document.querySelector(`#${id}`);
      if (!input) {
        input = document.createElement("input");
        input.id = id;
        input.type = "file";
        input.hidden = true;
        document.body.appendChild(input);
      }
      return input;
    }
    async _getImageResolution(image) {
      try {
        const bitmap = await createImageBitmap(image);
        const resolution = `${bitmap.width}x${bitmap.height}`;
        bitmap.close();
        return resolution;
      } catch (e) {
        console.warn("Failed to get image resolution:", e);
        return void 0;
      }
    }
    _getBase64FromFile(file) {
      return new Promise((resolve2, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          const base64 = dataUrl.split(",")[1];
          resolve2(base64);
        };
        reader.onerror = (e) => {
          reject(e);
        };
        reader.readAsDataURL(file);
      });
    }
    _getVideoMetadata(videoFile) {
      return new Promise((resolve2) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => {
          const seekTime = Math.min(1, video.duration * 0.1);
          video.currentTime = seekTime;
        };
        video.onseeked = () => {
          const result = {
            resolution: `${video.videoWidth}x${video.videoHeight}`,
            duration: video.duration
          };
          try {
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              result.thumbnail = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
            }
          } catch (e) {
            console.warn("Failed to generate video thumbnail:", e);
          }
          URL.revokeObjectURL(video.src);
          resolve2(result);
        };
        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          resolve2({});
        };
        video.src = URL.createObjectURL(videoFile);
      });
    }
    async checkPermissions() {
      if (typeof navigator === "undefined" || !navigator.permissions) {
        throw this.unavailable("Permissions API not available in this browser");
      }
      try {
        const permission = await window.navigator.permissions.query({
          name: "camera"
        });
        return {
          camera: permission.state,
          photos: "granted"
        };
      } catch (_a) {
        throw this.unavailable("Camera permissions are not available in this browser");
      }
    }
    async requestPermissions() {
      throw this.unimplemented("Not implemented on web.");
    }
    async pickLimitedLibraryPhotos() {
      throw this.unavailable("Not implemented on web.");
    }
    async getLimitedLibraryPhotos() {
      throw this.unavailable("Not implemented on web.");
    }
  };
  var Camera = new CameraWeb();

  // node_modules/@capacitor/camera/dist/esm/index.js
  var Camera2 = registerPlugin("Camera", {
    web: () => new CameraWeb()
  });

  // node_modules/@capacitor/splash-screen/dist/esm/index.js
  init_dist();
  var SplashScreen = registerPlugin("SplashScreen", {
    web: () => Promise.resolve().then(() => (init_web3(), web_exports3)).then((m) => new m.SplashScreenWeb())
  });

  // node_modules/@capacitor/status-bar/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/status-bar/dist/esm/definitions.js
  var Style;
  (function(Style2) {
    Style2["Dark"] = "DARK";
    Style2["Light"] = "LIGHT";
    Style2["Default"] = "DEFAULT";
  })(Style || (Style = {}));
  var Animation;
  (function(Animation2) {
    Animation2["None"] = "NONE";
    Animation2["Slide"] = "SLIDE";
    Animation2["Fade"] = "FADE";
  })(Animation || (Animation = {}));

  // node_modules/@capacitor/status-bar/dist/esm/index.js
  var StatusBar = registerPlugin("StatusBar");

  // node_modules/@capacitor/filesystem/dist/esm/index.js
  init_dist();

  // node_modules/@capacitor/synapse/dist/synapse.mjs
  function s(t) {
    t.CapacitorUtils.Synapse = new Proxy(
      {},
      {
        get(e, n) {
          return new Proxy({}, {
            get(w, o) {
              return (c, p, r) => {
                const i = t.Capacitor.Plugins[n];
                if (i === void 0) {
                  r(new Error(`Capacitor plugin ${n} not found`));
                  return;
                }
                if (typeof i[o] != "function") {
                  r(new Error(`Method ${o} not found in Capacitor plugin ${n}`));
                  return;
                }
                (async () => {
                  try {
                    const a = await i[o](c);
                    p(a);
                  } catch (a) {
                    r(a);
                  }
                })();
              };
            }
          });
        }
      }
    );
  }
  function u(t) {
    t.CapacitorUtils.Synapse = new Proxy(
      {},
      {
        get(e, n) {
          return t.cordova.plugins[n];
        }
      }
    );
  }
  function f(t = false) {
    typeof window > "u" || (window.CapacitorUtils = window.CapacitorUtils || {}, window.Capacitor !== void 0 && !t ? s(window) : window.cordova !== void 0 && u(window));
  }

  // node_modules/@capacitor/filesystem/dist/esm/index.js
  init_definitions2();
  var Filesystem = registerPlugin("Filesystem", {
    web: () => Promise.resolve().then(() => (init_web4(), web_exports4)).then((m) => new m.FilesystemWeb())
  });
  f();

  // node_modules/@capacitor/share/dist/esm/index.js
  init_dist();
  var Share = registerPlugin("Share", {
    web: () => Promise.resolve().then(() => (init_web5(), web_exports5)).then((m) => new m.ShareWeb())
  });

  // node_modules/@capacitor/calendar/dist/esm/index.js
  init_dist();
  var Calendar = registerPlugin("Calendar", {
    web: () => Promise.resolve().then(() => (init_web6(), web_exports6)).then((m) => new m.CalendarWeb())
  });

  // capacitor-src/bridge.js
  var isNative = Capacitor.isNativePlatform();
  function safe(fn) {
    return function() {
      if (!isNative) return Promise.resolve(null);
      try {
        return fn.apply(null, arguments).catch(function() {
          return null;
        });
      } catch (e) {
        return Promise.resolve(null);
      }
    };
  }
  var hapticSuccess = safe(function() {
    return Haptics.notification({ type: NotificationType.Success });
  });
  var requestNotifyPermission = safe(function() {
    return LocalNotifications.requestPermissions().then(function(r) {
      return r.display === "granted";
    });
  });
  var MILESTONE_IDS = [4901, 4902, 4903, 4904, 4905, 4906];
  var cancelMilestoneNotifications = safe(function() {
    return LocalNotifications.cancel({ notifications: MILESTONE_IDS.map(function(id) {
      return { id };
    }) });
  });
  var scheduleMilestoneNotifications = safe(function(items) {
    var notifications = items.map(function(it, i) {
      return {
        id: MILESTONE_IDS[i] || 4900 + i,
        title: it.title,
        body: it.body,
        schedule: { at: it.date },
        sound: void 0
      };
    });
    if (!notifications.length) return Promise.resolve(null);
    return LocalNotifications.schedule({ notifications });
  });
  var takePhoto = safe(function() {
    return Camera2.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      quality: 85,
      promptLabelHeader: "\u5199\u771F\u3092\u3048\u3089\u3076",
      promptLabelPhoto: "\u30A2\u30EB\u30D0\u30E0\u304B\u3089\u3048\u3089\u3076",
      promptLabelPicture: "\u30AB\u30E1\u30E9\u3067\u64AE\u308B"
    }).then(function(photo) {
      if (!photo || !photo.webPath) return null;
      return fetch(photo.webPath).then(function(r) {
        return r.blob();
      }).then(function(blob) {
        return new File([blob], "photo.jpg", { type: blob.type || "image/jpeg", lastModified: Date.now() });
      });
    });
  });
  var WRITE_CHUNK_SIZE = 1e6;
  function writeFileChunked(path, text, directory, encoding) {
    function step(offset) {
      var chunk = text.slice(offset, offset + WRITE_CHUNK_SIZE);
      var op = offset === 0 ? Filesystem.writeFile : Filesystem.appendFile;
      return op({ path, data: chunk, directory, encoding }).then(function() {
        var next = offset + WRITE_CHUNK_SIZE;
        if (next < text.length) return step(next);
        return Filesystem.getUri({ path, directory });
      });
    }
    return step(0);
  }
  var saveTextFile = safe(function(filename, text, dialogTitle) {
    return writeFileChunked(filename, text, Directory.Cache, Encoding.UTF8).then(function(result) {
      return Share.share({ url: result.uri, dialogTitle: dialogTitle || "\u4FDD\u5B58" });
    }).then(function() {
      return true;
    });
  });
  var addCalendarEvents = safe(function(events) {
    return Calendar.requestPermissions({ permissions: ["writeCalendar"] }).then(function(status) {
      if (status.writeCalendar !== "granted") return false;
      var chain = Promise.resolve();
      events.forEach(function(ev) {
        var start = ev.date.getTime();
        var opts = {
          title: ev.title,
          startDate: start,
          endDate: start + 24 * 60 * 60 * 1e3,
          isAllDay: true
        };
        if (ev.recurrence) opts.recurrence = { frequency: ev.recurrence };
        chain = chain.then(function() {
          return Calendar.createEvent(opts);
        });
      });
      return chain.then(function() {
        return true;
      });
    });
  });
  function hideSplash() {
    if (!isNative) return;
    try {
      SplashScreen.hide();
    } catch (e) {
    }
  }
  function setStatusBarStyle(dark) {
    if (!isNative) return;
    try {
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    } catch (e) {
    }
  }
  window.TomoshibiNative = {
    isNative,
    hapticSuccess,
    requestNotifyPermission,
    scheduleMilestoneNotifications,
    cancelMilestoneNotifications,
    takePhoto,
    hideSplash,
    setStatusBarStyle,
    saveTextFile,
    addCalendarEvents
  };
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
