// Headless WebKit check for Onosendai's Tool (macOS only, no installs).
// Loads a page, runs optional JS, prints JS errors / console.error, saves a PNG.
// Build:  swiftc -O tools/webshot.swift -o /tmp/webshot
// Run:    python3 -m http.server 8765 &   then
//         /tmp/webshot "http://localhost:8765/#/runes" out.png 1400 1000 "document.title"
// Note: CSS transitions don't advance in the hidden window; inject
//       "*{transition:none!important}" before clicking if colours look stale.

import AppKit
import WebKit

// usage: shot <url> <out.png> <width> <height> [js-to-run-before-snapshot]
let args = CommandLine.arguments
let url = URL(string: args[1])!
let out = args[2]
let w = Double(args[3])!, h = Double(args[4])!
let preJS = args.count > 5 ? args[5] : ""

class Nav: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
  var logs: [String] = []
  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { logs.append("\(m.body)") }
  func webView(_ wv: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
      wv.evaluateJavaScript(preJS.isEmpty ? "1" : preJS) { r, e in
        if let e = e { print("PREJS ERROR: \(e)") } else if let r = r { print("PREJS: \(r)") }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
          let cfg = WKSnapshotConfiguration()
          wv.takeSnapshot(with: cfg) { img, err in
            for l in self.logs { print("CONSOLE: \(l)") }
            if let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
               let png = rep.representation(using: .png, properties: [:]) {
              try? png.write(to: URL(fileURLWithPath: out)); print("saved \(out)")
            } else { print("snapshot failed: \(String(describing: err))") }
            exit(0)
          }
        }
      }
    }
  }
}
let app = NSApplication.shared
let nav = Nav()
let ucc = WKUserContentController()
ucc.add(nav, name: "log")
let hook = """
window.addEventListener('error', e => webkit.messageHandlers.log.postMessage('ERROR ' + e.message + ' @' + e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => webkit.messageHandlers.log.postMessage('REJECT ' + (e.reason && (e.reason.stack || e.reason))));
const _ce = console.error; console.error = (...a) => { webkit.messageHandlers.log.postMessage('console.error ' + a.join(' ')); _ce(...a); };
"""
ucc.addUserScript(WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
let cfg = WKWebViewConfiguration(); cfg.userContentController = ucc
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: cfg)
wv.navigationDelegate = nav
let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: w, height: h), styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = wv
wv.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { print("timeout"); exit(1) }
app.run()
