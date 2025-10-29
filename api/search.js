const axios = require('axios');
const cheerio = require('cheerio');

// Vercelは、ファイルパスを基にエンドポイントを自動で割り当てるため、
// Expressのミドルウェア関数として処理をエクスポートします。
// このファイルが /api/search.js なので、URLは /api/search になります。
module.exports = async (req, res) => {
    // クエリパラメータから検索キーワード (q) を取得
    const keyword = req.query.q;

    if (!keyword) {
        return res.status(400).json({
            success: false,
            error: "Missing Query",
            message: "検索キーワード (q) をクエリパラメータに指定してください。",
        });
    }

    const encodedKeyword = encodeURIComponent(keyword);
    // Anison Databaseの検索URL (サーバーブロック対策のため、httpを使用)
    const searchUrl = `http://anison.info/data/search.php?q=${encodedKeyword}`;

    try {
        // Anison Databaseへのアクセス（サーバーブロック対策のため、GASとは異なるIPからアクセス）
        const { data: html } = await axios.get(searchUrl, {
            headers: {
                // User-Agentを設定し、ブラウザからのアクセスに見せかける
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            },
            // リダイレクトを自動で追跡しない設定（必要に応じて）
            maxRedirects: 0, 
            validateStatus: (status) => status >= 200 && status < 400 // 2xxと3xxを成功とする
        });

        const $ = cheerio.load(html);
        const results = [];

        // 検索結果テーブルの特定
        // ページ全体を探索し、テーブルを取得
        const $table = $('body').find('table'); 
        
        // 検索結果が全くない場合をチェック
        if ($table.length === 0 || $table.text().includes('該当するデータが見つかりませんでした')) {
            return res.status(200).json({
                success: true,
                headers: ["アニメタイトル", "曲タイトル", "区分", "アーティスト", "収録年"],
                data: [],
            });
        }

        // テーブルの行を走査 (最初の行はヘッダーなのでスキップ)
        $table.find('tr').slice(1).each((i, row) => {
            const $cols = $(row).find('td');
            if ($cols.length >= 5) {
                // スクレイピングで取得したデータを整形
                const relationType = $cols.eq(0).text().trim(); // 区分 (OP, ED, 挿入歌など)
                const songTitle = $cols.eq(1).text().trim();    // 曲タイトル
                const animeTitle = $cols.eq(2).text().trim();   // アニメタイトル
                const artistName = $cols.eq(3).text().trim();   // アーティスト名
                const releaseYear = $cols.eq(4).text().trim();  // 収録年 (通常は年)

                results.push({
                    relationType,
                    songTitle,
                    animeTitle,
                    artistName,
                    releaseYear,
                });
            }
        });

        // 成功応答 (JSON形式)
        res.status(200).json({
            success: true,
            headers: ["アニメタイトル", "曲タイトル", "区分", "アーティスト", "収録年"],
            data: results,
        });

    } catch (error) {
        // HTTPリクエストまたはスクレイピング中のエラーを捕捉
        console.error("Scraping Error:", error.message);
        res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "中間サーバーでスクレイピング中にエラーが発生しました。",
            details: error.message,
        });
    }
};
