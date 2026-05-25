const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// 遊戲狀態與玩家資料
let players = {};
let currentRound = 0;
let currentBids = [];
let isBiddingOpen = false;

// 💡 【五輪拍賣的劇本設定】金額皆以台幣(NTD)邏輯設計，但 trueValue 代表廣告主獲得的總轉換價值
const roundsConfig = [
    { title: "Lot 1：新竹市・二十代大學生", desc: "喜歡動漫、正在搜尋視覺小說與遊戲開發工具", trueValue: 3000 },
    { title: "Lot 2：竹科・三十代資深工程師", desc: "高收入、近期頻繁瀏覽房地產與新車資訊", trueValue: 8000 },
    { title: "Lot 3：十歲國小生 (借媽媽手機)", desc: "誤觸廣告機率極高、完全無實際消費能力", trueValue: 50 },
    { title: "Lot 4：台北市・美妝潮流網網紅", desc: "粉絲互動率高、熱愛精緻生活與醫美話題", trueValue: 4500 },
    { title: "Lot 5：即將結婚的新婚伴侶", desc: "急需婚紗、鑽戒、蜜月旅行規劃與餐廳預約", trueValue: 12000 }
];

io.on('connection', (socket) => {

    // 玩家登入
    socket.on('player_join', (companyName) => {
        players[socket.id] = { name: companyName, balance: 10000 };
        io.emit('update_players', Object.values(players));
    });

    // 主持人開始新的一輪
    socket.on('host_start_round', () => {
        if (currentRound >= 5) {
            // 遊戲結束，結算排行榜
            const leaderboard = Object.values(players).sort((a, b) => b.balance - a.balance);
            io.emit('game_over', leaderboard);
            return;
        }
        currentBids = [];
        isBiddingOpen = true;
        io.emit('round_start', { roundIndex: currentRound, roundData: roundsConfig[currentRound] });
    });

    // 接收玩家出價
    socket.on('submit_bid', (amount) => {
        if (!isBiddingOpen || !players[socket.id]) return;

        let bid = parseFloat(amount);
        if (bid > players[socket.id].balance) bid = players[socket.id].balance; // 防止超額出價

        currentBids.push({ id: socket.id, name: players[socket.id].name, amount: bid, time: Date.now() });
        io.emit('update_bids', currentBids);
    });

    // 主持人落槌結標
    socket.on('trigger_blackbox', () => {
        if (!isBiddingOpen || currentBids.length === 0) return;
        isBiddingOpen = false;

        // 排序：出價高者贏，同價則先搶先贏
        currentBids.sort((a, b) => b.amount === a.amount ? a.time - b.time : b.amount - a.amount);
        const winner = currentBids[0];
        const roundData = roundsConfig[currentRound];

        // 1. 【廣告主盈虧邏輯】對廣告主（買方）而言，這是宏觀的預算投資，維持原本的獲利算法：
        const netProfit = roundData.trueValue - winner.amount;
        players[winner.id].balance += netProfit; // 更新贏家錢包

        // 2. 【核心修正：AdTech 黑盒子抽成】所有平台的抽成，都以廣告主付出的「出價金額」為基數計算
        const originalPrice = winner.amount;
        const dspFee = +(originalPrice * 0.15).toFixed(2);                         // Google DSP 抽 15%
        const sspFee = +((originalPrice - dspFee) * 0.20).toFixed(2);               // Google SSP 再抽剩餘的 20%
        const techTax = +(originalPrice * 0.35).toFixed(2);                         // 數據商與代理商隱形稅 35%

        // 平台抽完後，留在程序化交易池子裡原本剩下來的總利潤
        const poolRemainder = +(originalPrice - dspFee - sspFee - techTax).toFixed(2);

        // 3. 【核心修正：弱化媒體轉換】
        // 論文指出，媒體在單次即時競價中被層層剝削，實拿極其微薄。
        // 我們在這裡將留下來的錢模擬「換算成單次曝光單價（除以 1000）」並加上隨機幾塊錢的浮動
        // 這樣能完美呈現廣告主花了 4000 多元，但台灣在地媒體卻只拿到幾塊錢的「斷崖式剝奪感」！
        let mediaRevenue = +((poolRemainder / 1000) + (Math.random() * 3) + 1).toFixed(2);

        // 確保媒體實拿在視覺上一定是符合台灣現實的慘況（新台幣 1 ~ 5 元之間）
        if (mediaRevenue > 5) mediaRevenue = +(4 + Math.random()).toFixed(2);

        io.emit('round_result', {
            winnerName: winner.name,
            winnerId: winner.id,
            bidAmount: originalPrice,
            trueValue: roundData.trueValue,
            netProfit: netProfit,
            // 傳送個別平台的抽成數字，讓前端畫面可以把帳目完全對齊
            dspFee: dspFee,
            sspFee: sspFee,
            techTax: techTax,
            mediaFinal: mediaRevenue
        });

        currentRound++;
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update_players', Object.values(players));
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`古典拍賣會已啟動：http://localhost:${PORT}`); });