const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let bids = [];
let isAuctionActive = true;

io.on('connection', (socket) => {
    console.log('一個玩家已連線');

    // 接收來自全班手機的廣告主出價
    socket.on('submit_bid', (data) => {
        if (!isAuctionActive) return;

        bids.push({
            id: socket.id,
            company: data.company,
            amount: parseFloat(data.amount)
        });

        // 即時傳送給大螢幕更新跑馬燈
        io.emit('update_bids', bids);
    });

    // 大螢幕觸發「結標 / Google黑盒子啟動」
    socket.on('trigger_blackbox', () => {
        if (bids.length === 0) return;
        isAuctionActive = false;

        // 找出最高出價
        bids.sort((a, b) => b.amount - a.amount);
        const winningBid = bids[0];

        // 【Google 黑盒子分潤演算法】
        const originalPrice = winningBid.amount;
        const dspFee = +(originalPrice * 0.15).toFixed(2); // Google DSP 抽 15%
        const sspFee = +((originalPrice - dspFee) * 0.20).toFixed(2); // Google SSP 抽 20%
        const techTax = +(originalPrice * 0.35).toFixed(2); // 其他中間商DMP/代理商抽成
        const mediaRevenue = +(originalPrice - dspFee - sspFee - techTax).toFixed(2); // 媒體慘剩

        // 將剝奪結果同步廣播給全班
        io.emit('auction_result', {
            winner: winningBid.company,
            original: originalPrice,
            dsp: dspFee,
            ssp: sspFee,
            tax: techTax,
            final: mediaRevenue < 0 ? 0.05 : mediaRevenue // 確保至少有極微薄的小錢
        });
    });

    socket.on('disconnect', () => {
        bids = bids.filter(b => b.id !== socket.id);
    });
});

// http.listen(3000, () => {
//     console.log('賽博廣告拍賣場已啟動：http://localhost:3000');
// });
const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`伺服器成功啟動，正在監聽連接埠：${PORT}`);
});