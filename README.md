# 光澤愛美肌年度營運儀表板｜私人版 V02

## 安全架構

- 網頁原始碼不內嵌新客、消費金額、Meta 花費或年度預算。
- 使用者登入 Google 後，瀏覽器以唯讀權限向 Google Sheets API 讀取資料。
- Google Sheet 維持私人分享；沒有 Sheet 權限的帳號即使取得網頁網址，也無法讀取資料。
- Google OAuth Client ID 不是密碼；不得加入 Client Secret、API 金鑰或任何帳號密碼。

## 資料來源

- Google Sheet：`1g7oiooG4JNMcJWvtW_OsU51KtfLqk_uU5TFj3_Zo4oI`
- 新客：`月度KPI!A1:Y100`
- Meta：`Meta月度KPI!A1:T100`
- 預算：`年度預算!A1:R100`
- 消費核對：`月報總覽!A1:P40`、`分店消費!A1:P401`

## 正式上線前必要設定

1. 在 Google Cloud 專案啟用 Google Sheets API。
2. 建立「網頁應用程式」OAuth Client ID。
3. 將正式 GitHub Pages 網域加入「已授權的 JavaScript 來源」。
4. 把 Client ID 寫入 `config.js` 的 `googleClientId`。
5. Google Sheet 僅分享檢視權限給需要查看儀表板的帳號。

## 本機建置

執行：

```powershell
node .\build_v02.js
```

輸出 `index.html`。Google OAuth 不支援 `file://` 來源；本機用 `http://127.0.0.1:8767`，正式網站用已授權的 HTTPS 來源。

## 維護與驗證

- `dashboard.template.html`：固定粉紅版型；修改後執行 `node build_v02.js`，不可手改產生的 `index.html`。
- `dashboard-data.js`：欄位驗證、年度定義、缺漏判讀與計算。
- `dashboard.js`：登入、資料讀取、四頁畫面與篩選。
- `node --test dashboard.test.js`：不包含真實營運數字的合成資料測試。
- 登入後每五分鐘在頁面可見時讀取一次，也可按「更新資料」。存取權杖只留在記憶體；到期、登出或讀取錯誤會清除畫面資料，不假裝顯示最新數據。
- 更新 Google Sheet 仍須保持欄名、月份與年度月序一致；新客兩店同月份須完整標記「已匯入」，重複列／漏月份會停止顯示並報錯。
- Meta CPA 使用訊息廣告花費／Meta 詢問數，不用全部廣告花費；所有客服人工詢問數均不納入。
- 已知 Meta 空白或「該分店資料待補」的佔位零不視為實際零；部分資料明確標示，不宣稱完整品牌成效。
- 年度預算與 Meta 表的同月花費不一致時停止顯示，避免頁面數字互相矛盾。
- 消費表現可切換年度累積／單月、新客／舊客／合計與分店。資料依預約日期歸月，不代表全店營收或 Meta 歸因收益。
- 平均客單依月報定義使用「消費金額 ÷ 到店數」；到店消費率使用「消費數 ÷ 到店數」。加總後重算，不能平均各列比率，也不加總中位數。
- 消費數沿用來源計數，跨月累積未去重，不標成獨立消費人數。人工詢問數不參與計算。
- 每月、每客群的分店金額／消費數／到店數均須與月報總覽相等；缺值、重複、截斷、缺月或口徑不符均停止顯示，不默認為零。

## 狀態｜2026-08-31

- 本機建置與 10 項測試通過，涵蓋四頁、消費篩選、數值核對與登出清除。
- 來源 Sheets 消費總覽與分店明細已核對；本次未重讀原始 PDF。
- GitHub Pages 已部署；正式 HTTPS 來源已加入 Google OAuth 並讀回。程式碼公開，Google Sheet 維持限制存取。
- 正式 Google 授權後讀取及未授權帳號拒絕仍待實際帳號驗收，不能將設定完成當作登入驗收完成。
- 私人驗收快照、來源匯出、帳戶密鑰與報告不得加入公開儲存庫。
