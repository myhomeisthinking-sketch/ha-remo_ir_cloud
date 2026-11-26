# Remo IR Cloud

[日本語](#日本語) | [English](#english)

---

# 日本語

Nature Remo の**クラウドAPI**で取得した信号を、Home Assistant の**ボタンエンティティ**として登録・管理するカスタムインテグレーションです。

## 特長

- Nature Remo のクラウドに登録済みの家電と信号の一覧を取得し、`button.remocloud_...` として登録
- サイドバーの専用パネル（管理者のみ）で、登録・編集・削除
- クラウドへの問い合わせは、「情報を取得」を押したときだけ（起動時・登録時・送信時には、一覧を取得しません）
- トークンをリセットしても、パネルから入れ替え可能
- 削除するとき、そのボタンを参照している設定を一覧表示
- ボタンは、家電ごとのデバイスにまとまります
- エリアの指定に対応

## 前提

- Nature Remo のアクセストークン（https://home.nature.global で発行）
- インターネットへの接続（クラウドAPIを使います）

## 動作確認環境

- インストール方法：Home Assistant OS
- Home Assistant Core：2026.11.2
- Supervisor：2026.11.0
- Operating System：18.4
- フロントエンド：20261028.6

## インストール

### HACS（カスタムリポジトリ）

1. HACS を開き、右上のメニューから「カスタムリポジトリ」を選びます。
2. リポジトリに `https://github.com/myhomeisthinking-sketch/ha-remo_ir_cloud` を、種類に「Integration」を指定して追加します。
3. HACS で「Remo IR Cloud」をダウンロードし、HAを再起動します。
4. 設定 → デバイスとサービス → 統合を追加 →「Remo IR Cloud」を選びます。
5. サイドバーに「Remo IR Cloud」（管理者のみ）が表示されます。

### 手動

1. `custom_components/remo_ir_cloud/` を、HAの `config/custom_components/` にコピーします。
2. HAを再起動します。
3. 設定 → デバイスとサービス → 統合を追加 →「Remo IR Cloud」を選びます。
4. サイドバーに「Remo IR Cloud」（管理者のみ）が表示されます。

## 使い方

1. **トークンの設定**：「Nature Remo クラウド」の「設定」に、アクセストークンを入力します。保存前に、クラウドで有効かどうかを確認します。トークンをリセットしたときも、ここから入れ替えます。
2. **情報を取得**：「情報を取得」を押すと、家電と信号の一覧を取得します。結果は保存され、再起動後も残ります。
3. **信号を登録**：一覧から信号を選び（必要ならテスト送信）、`button.remocloud_` に続けてIDを入力し、アクション名称・アイコン・エリア（任意）を付けて追加します。名称の初期値は「家電名 信号名」です。
4. **登録済みのボタン**：送信 / 編集（名称・アイコン・エリア・信号の差し替え） / 削除ができます。削除するときは、そのボタンを参照している設定を表示し、ボタンのエンティティも、あわせて削除します。

同じ信号を、すでに登録している場合は、追加できません。

## ボタンとして使う

登録した信号は、ダッシュボードに置いたり、automation や script から押したりできます。

```yaml
- action: button.press
  target:
    entity_id: button.remocloud_tv_power
```

- エンティティIDは、登録時に指定したものになります。後から変更するときは、HAの「設定 → デバイスとサービス → エンティティ」で行ってください（登録内容は内部の識別子で管理しているため、影響しません）。
- エリアは、ボタンのエンティティのエリアとして設定されます。HAの画面で変更した場合も、パネルは現在のエリアを表示します。パネルの編集で、解除もできます。
- `button.press` は、値を渡せません。実行のたびに値を変える場合は、`remo_ir_cloud.send_signal` サービスを直接呼んでください。
- 複数の操作を続けて行う場合は、script や automation の中で `button.press` を順に呼びます。

## サービス

- `remo_ir_cloud.send_signal`（`signal_id`）：指定した信号を、クラウド経由で送信します。

## 注意

- アクセストークンと、取得した信号の一覧、登録内容は、統合の保存領域（`.storage/remo_ir_cloud`）に保存されます。
- クラウドAPIにはレート制限があります。パネルに、取得時点の残り回数を表示します。
- 削除時の参照検索は、automations.yaml / scenes.yaml / scripts.yaml / configuration.yaml / ダッシュボード（Lovelace）の保存データが対象です。ダッシュボードのカードなど、検出できない場所もあります。

## セキュリティ

- パネルとAPIは、管理者のみが使えます（サーバー側でも、管理者かどうかを確認します）。
- アクセストークンは、`.storage/remo_ir_cloud` に、所有者だけが読める権限で保存されます。HAのバックアップにも含まれるので、バックアップは、秘匿情報として扱ってください。トークンを、画面・ログ・APIの応答に出すことはありません。
- クラウドとの通信は、証明書を検証するHTTPSです。トークンの形式（空白・改行を含まない、8〜512文字の半角）を検証し、ヘッダーに入れる値も、検査してから送ります。
- クラウドから受け取った名称などは、制御文字を除き、長さを制限して保存し、画面に表示する値は、すべてエスケープします。
- サービス（`remo_ir_cloud.send_signal`）は、HAの権限の仕組みに従い、管理者以外のユーザーからも呼び出せます。

## ライセンス

MIT License です。詳細は、[LICENSE](LICENSE) を参照してください。

同梱のアイコン・ロゴ画像（`custom_components/.../brand/`）には、Nature Remo の商標が含まれます。これらの画像は、MITライセンスの対象外です。

## 免責事項

本プロジェクトは、Nature Remo の提供元とは無関係の、非公式なものです。「Nature Remo」は、その提供元の商標です。

---

# English

This custom integration registers and manages signals retrieved through the **Nature Remo Cloud API** as **button entities** in Home Assistant.

## Features

- Retrieves the list of appliances and signals registered in the Nature Remo cloud and registers them as `button.remocloud_...` entities.
- Provides a dedicated sidebar panel (administrators only) for adding, editing, and deleting buttons.
- Communicates with the cloud only when **Fetch Information** is pressed. The signal list is not fetched at startup, when registering buttons, or when sending signals.
- Allows you to replace the access token through the panel, even after resetting it.
- Displays a list of configurations that reference a button before deleting it.
- Groups buttons into devices based on their associated appliances.
- Supports area assignment.

## Requirements

- Nature Remo access token (available from https://home.nature.global)
- Internet connection (uses the cloud API)

## Tested Environment

- Installation method: Home Assistant OS
- Home Assistant Core: 2026.11.2
- Supervisor: 2026.11.0
- Operating System: 18.4
- Frontend: 20261028.6

## Installation

### HACS (Custom Repository)

1. Open HACS and select **Custom repositories** from the menu in the upper-right corner.
2. Add `https://github.com/myhomeisthinking-sketch/ha-remo_ir_cloud` as a repository and select **Integration** as the category.
3. Download **Remo IR Cloud** through HACS and restart Home Assistant.
4. Go to **Settings → Devices & Services → Add Integration** and select **Remo IR Cloud**.
5. **Remo IR Cloud** will appear in the sidebar (administrators only).

### Manual Installation

1. Copy `custom_components/remo_ir_cloud/` into `config/custom_components/` in your Home Assistant configuration directory.
2. Restart Home Assistant.
3. Go to **Settings → Devices & Services → Add Integration** and select **Remo IR Cloud**.
4. **Remo IR Cloud** will appear in the sidebar (administrators only).

## Usage

1. **Set Access Token**: Enter your access token under **Settings** in the **Nature Remo Cloud** section. The token is validated against the cloud before it is saved. You can also replace the token here after resetting it.
2. **Fetch Information**: Press **Fetch Information** to retrieve the list of appliances and signals. The results are saved and persist across restarts.
3. **Register Signals**: Select a signal from the list (you can test-send it if necessary), enter an ID after `button.remocloud_`, and assign an action name, icon, and optionally an area. The default name is `Appliance Name Signal Name`.
4. **Manage Registered Buttons**: You can send signals, edit buttons (change the name, icon, area, or assigned signal), and delete buttons. Before deletion, the integration displays a list of configurations referencing the button and also removes the corresponding button entity.

A signal that has already been registered cannot be added again.

## Using Buttons

Registered signals can be added to dashboards or pressed from automations and scripts.

```yaml
- action: button.press
  target:
    entity_id: button.remocloud_tv_power
```

- The entity ID is the one specified during registration. To change it later, use **Settings → Devices & Services → Entities** in Home Assistant. This does not affect the integration's internal management, as registered items are identified using internal identifiers.
- The assigned area is set as the button entity's area. If you change the area through the Home Assistant interface, the panel will display the currently assigned area. You can also clear the area through the panel's edit function.
- `button.press` does not accept parameters. If you need to change the signal dynamically each time, call the `remo_ir_cloud.send_signal` service directly.
- To perform multiple operations in sequence, call `button.press` for each button in a script or automation.

## Services

- `remo_ir_cloud.send_signal` (`signal_id`): Sends the specified signal through the cloud.

## Notes

- The access token, fetched signal list, and registered button configurations are stored in the integration's storage directory (`.storage/remo_ir_cloud`).
- The cloud API has rate limits. The panel displays the remaining number of requests as reported at the time of retrieval.
- Reference checks performed before deletion cover `automations.yaml`, `scenes.yaml`, `scripts.yaml`, `configuration.yaml`, and saved dashboard (Lovelace) data. Some references, such as those in dashboard cards, may not be detected.

## Security

- The panel and its API are accessible to administrators only. Administrator privileges are also verified on the server side.
- The access token is stored in `.storage/remo_ir_cloud` with permissions that allow only its owner to read it. It is also included in Home Assistant backups, so backups should be treated as confidential. The token is never exposed in the UI, logs, or API responses.
- Communication with the cloud uses HTTPS with certificate verification. The token format (8–512 ASCII characters, without spaces or line breaks) is validated, and values are checked before being included in request headers.
- Names and other data received from the cloud have control characters removed and their lengths restricted before storage. All values displayed in the UI are properly escaped.
- The service (`remo_ir_cloud.send_signal`) follows Home Assistant's permission system and can also be called by non-administrator users.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

The bundled icon and logo images (`custom_components/.../brand/`) contain Nature Remo trademarks. These images are not covered by the MIT License.

## Disclaimer

This is an unofficial project and is not affiliated with the provider of Nature Remo. "Nature Remo" is a trademark of its respective owner.