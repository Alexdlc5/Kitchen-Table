import UIKit
import Capacitor
import GameKit

// Family tables (docs/DESIGN.md §9): invite-only real-time Game Center matches, reached from JS as
// Capacitor.Plugins.FamilyTable and wrapped by platform.table (proto/platform.js). This side only moves bytes and
// reports who is there; the host's JS runs the rules engine and the bots. Never automatches with strangers.
// Events: invited { from }, matched { players: [{ id, name }], host, me }, data { from, data }, playerState { player, state }.
@objc(FamilyTablePlugin)
public class FamilyTablePlugin: CAPPlugin, CAPBridgedPlugin, GKMatchmakerViewControllerDelegate, GKMatchDelegate, GKLocalPlayerListener {
    public let identifier = "FamilyTablePlugin"
    public let jsName = "FamilyTable"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "invite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leave", returnType: CAPPluginReturnPromise)
    ]
    private var match: GKMatch?
    private var inviteCall: CAPPluginCall? // resolves { matched } when the invite sheet closes
    private var listening = false

    // GameCenterPlugin.signIn owns GKLocalPlayer's authenticateHandler (Apple allows one); this only checks the result
    // and starts listening for invitations. Resolves { ok, player: { id, name } }.
    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let me = GKLocalPlayer.local
            guard me.isAuthenticated else { return call.resolve(["ok": false]) }
            if !self.listening { me.register(self); self.listening = true }
            call.resolve(["ok": true, "player": ["id": me.gamePlayerID, "name": me.displayName]])
        }
    }

    // Game Center's own invite sheet, invite-only: the player picks family or friends; 2-4 people at the table.
    @objc func invite(_ call: CAPPluginCall) {
        let request = GKMatchRequest()
        request.minPlayers = max(2, min(4, call.getInt("min") ?? 2))
        request.maxPlayers = max(request.minPlayers, min(4, call.getInt("max") ?? 4))
        DispatchQueue.main.async {
            guard let view = GKMatchmakerViewController(matchRequest: request) else { return call.reject("Game Center is not available") }
            view.matchmakingMode = .inviteOnly
            self.present(view, call)
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let match = match else { return call.reject("not at a table") }
        guard let text = call.getString("data") else { return call.reject("data is needed") }
        do { try match.sendData(toAllPlayers: Data(text.utf8), with: .reliable); call.resolve() } catch { call.reject(error.localizedDescription) }
    }

    @objc func leave(_ call: CAPPluginCall) {
        match?.disconnect(); match?.delegate = nil; match = nil
        call.resolve()
    }

    private func present(_ view: GKMatchmakerViewController, _ call: CAPPluginCall?) {
        inviteCall?.resolve(["matched": false])
        inviteCall = call
        view.matchmakerDelegate = self
        guard let top = bridge?.viewController else { inviteCall = nil; call?.reject("no view"); return }
        (top.presentedViewController ?? top).present(view, animated: true)
    }

    private func players() -> [[String: String]] {
        let all: [GKPlayer] = [GKLocalPlayer.local] + (match?.players ?? [])
        return all.map { ["id": $0.gamePlayerID, "name": $0.displayName] }.sorted { $0["id"]! < $1["id"]! }
    }

    private func announce() { // the host is the lowest gamePlayerID, so every device picks the same one
        let list = players()
        notifyListeners("matched", data: ["players": list, "host": list.first?["id"] ?? "", "me": GKLocalPlayer.local.gamePlayerID])
    }

    // MARK: GKMatchmakerViewControllerDelegate
    public func matchmakerViewControllerWasCancelled(_ view: GKMatchmakerViewController) {
        view.dismiss(animated: true)
        inviteCall?.resolve(["matched": false]); inviteCall = nil
    }

    public func matchmakerViewController(_ view: GKMatchmakerViewController, didFailWithError error: Error) {
        view.dismiss(animated: true)
        inviteCall?.reject(error.localizedDescription); inviteCall = nil
    }

    public func matchmakerViewController(_ view: GKMatchmakerViewController, didFind match: GKMatch) {
        view.dismiss(animated: true)
        self.match?.disconnect()
        self.match = match
        match.delegate = self
        inviteCall?.resolve(["matched": true]); inviteCall = nil
        announce()
    }

    // MARK: GKLocalPlayerListener: someone invited this player (in the app, or by tapping the notification)
    public func player(_ player: GKPlayer, didAccept invite: GKInvite) {
        notifyListeners("invited", data: ["from": invite.sender.displayName])
        DispatchQueue.main.async {
            guard let view = GKMatchmakerViewController(invite: invite) else { return }
            self.present(view, nil)
        }
    }

    // MARK: GKMatchDelegate
    public func match(_ match: GKMatch, didReceive data: Data, fromRemotePlayer player: GKPlayer) {
        notifyListeners("data", data: ["from": player.gamePlayerID, "data": String(decoding: data, as: UTF8.self)])
    }

    public func match(_ match: GKMatch, player: GKPlayer, didChange state: GKPlayerConnectionState) {
        notifyListeners("playerState", data: ["player": player.gamePlayerID, "name": player.displayName, "state": state == .connected ? "connected" : "disconnected"])
        if state == .connected { announce() }
    }
}
