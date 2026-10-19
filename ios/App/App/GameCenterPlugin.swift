import UIKit
import Capacitor
import GameKit

// Game Center leaderboards, reached from JS as Capacitor.Plugins.GameCenter (proto/platform.js).
// A local plugin: no npm Game Center plugin supported Capacitor 8 and Swift Package Manager (see docs/SETUP.md).
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboards", returnType: CAPPluginReturnPromise)
    ]
    private var signInView: UIViewController? // Game Center's sign-in sheet, kept for when the player taps Leaderboards

    // Quiet sign-in: a player already signed in to Game Center gets the "Welcome back" banner; anyone else is never
    // shown the sign-in sheet at launch. Resolves { available } once: false when Game Center is off for this player.
    @objc func signIn(_ call: CAPPluginCall) {
        var pending: CAPPluginCall? = call // the handler runs again whenever the sign-in state changes
        DispatchQueue.main.async {
            GKLocalPlayer.local.authenticateHandler = { [weak self] view, _ in
                self?.signInView = view
                pending?.resolve(["available": GKLocalPlayer.local.isAuthenticated || view != nil])
                pending = nil
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let board = call.getString("board"), let value = call.getInt("value") else { return call.reject("board and value are needed") }
        guard GKLocalPlayer.local.isAuthenticated else { return call.resolve() } // signed out: nothing to send
        GKLeaderboard.submitScore(value, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [board]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    // Resolves { shown }: the leaderboards, or the sign-in sheet first if the player isn't signed in yet.
    @objc func showLeaderboards(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let top = self.bridge?.viewController else { return call.resolve(["shown": false]) }
            if GKLocalPlayer.local.isAuthenticated {
                let view = GKGameCenterViewController(state: .leaderboards)
                view.gameCenterDelegate = self
                top.present(view, animated: true)
            } else if let view = self.signInView {
                top.present(view, animated: true)
            } else { return call.resolve(["shown": false]) }
            call.resolve(["shown": true])
        }
    }

    public func gameCenterViewControllerDidFinish(_ view: GKGameCenterViewController) {
        view.dismiss(animated: true)
    }
}

// The app's web view: Capacitor's own, plus the local GameCenter and FamilyTable plugins (registered before the page loads).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
        bridge?.registerPluginInstance(FamilyTablePlugin())
    }
}
