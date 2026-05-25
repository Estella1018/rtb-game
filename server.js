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

// 💡 【五輪拍賣的劇本設定】你可以自己修改 trueValue (實際帶來的收益)
const roundsConfig = [
    { title: "Lot 1：新竹市・二十代大學生", desc: "標籤：喜歡動漫、正在搜尋遊戲開發工具", trueValue: 3000 }, // 陷阱：價值普通，容易被溢價瘋搶
    { title: "Lot 2：竹科・三十代資深工程師", desc: "標籤：高收入、近期頻繁瀏覽房地產", trueValue: 8000 }, // 大補丸：真正的高價值受眾
    { title: "Lot 3：十歲國小生 (借媽媽手機)", desc: "標籤：誤觸廣告機率極高、無消費能力", trueValue: 50 },  // 終極陷阱：誰買誰虧到破產
    { title: "Lot 4：台北市・美妝網紅", desc: "標籤：粉絲互動率高、熱愛精緻生活", trueValue: 4500 },
    { title: "Lot 5：即將結婚的伴侶", desc: "標籤：急需婚紗、鑽戒、蜜月旅行規劃", trueValue: 12000 } // 最後的翻盤機會
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

        // 計算贏家的盈虧 (ROI = 真實價值 - 出價)
        const netProfit = roundData.trueValue - winner.amount;
        players[winner.id].balance += netProfit; // 更新贏家錢包

        // 計算平台剝削與媒體實得 (不管廣告主賺賠，平台照抽出價金額！)
        const originalPrice = winner.amount;
        const dspFee = +(originalPrice * 0.15).toFixed(2);
        const sspFee = +((originalPrice - dspFee) * 0.20).toFixed(2);
        const techTax = +(originalPrice * 0.35).toFixed(2);
        const mediaRevenue = +(originalPrice - dspFee - sspFee - techTax).toFixed(2);

        io.emit('round_result', {
            winnerName: winner.name,
            winnerId: winner.id,
            bidAmount: originalPrice,
            trueValue: roundData.trueValue,
            netProfit: netProfit,
            mediaFinal: mediaRevenue > 0 ? mediaRevenue : 5 // 確保不會是負數，至少給個 5 塊錢
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