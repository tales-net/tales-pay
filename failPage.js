function generateFailPageHtml(errorMessage) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <script src="protection.js" defer></script>
        <title>فشل العملية - شبكة حكايات</title>
        
        <!-- ربط الأيقونة -->
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          * { box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Cairo, sans-serif; 
            background: #fef2f2; 
            text-align: center; 
            margin: 0; 
            padding: 15px; 
            direction: rtl; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            min-height: 100vh; 
            overflow-x: hidden; 
          }
          .container { 
            background: white; 
            width: 100%; 
            max-width: 440px; 
            margin: auto; 
            padding: 25px 20px; 
            border-radius: 16px; 
            box-shadow: 0 10px 30px rgba(231, 76, 60, 0.15); 
            border: 2px solid #f8d7da; 
            animation: shake 0.5s ease-in-out; 
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-6px); }
            40%, 80% { transform: translateX(6px); }
          }
          .fail-badge { color: #e74c3c; font-size: 55px; margin-bottom: 8px; }
          
          h1 { 
            color: #991b1b; 
            font-size: 22px; 
            font-weight: 800; 
            margin-bottom: 12px; 
            letter-spacing: -0.5px;
          }
          
          p { 
            color: #4b5563; 
            font-size: 14px; 
            line-height: 1.6; 
            margin-bottom: 20px; 
            font-weight: 600; 
            word-break: break-word;
          }
          
          .btn { 
            background: #01338D; 
            color: white; 
            padding: 12px 20px; 
            border: none; 
            border-radius: 8px; 
            font-weight: bold; 
            text-decoration: none; 
            display: inline-block; 
            transition: background 0.3s; 
            width: 100%; 
            max-width: 250px; 
            font-size: 15px;
          }
          .btn:hover { background: #001f5c; }

          /* ميديا كويري للشاشات الصغيرة جداً */
          @media (max-width: 480px) {
            .container { padding: 20px 15px; }
            h1 { font-size: 20px; }
            .fail-badge { font-size: 45px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="fail-badge"><i class="fa fa-times-circle"></i></div>
          <h1>عذراً، لم تتم العملية بنجاح</h1>
          <p>${errorMessage}</p>
          <a href="/" class="btn"><i class="fa fa-home"></i> العودة للمحاولة مجدداً</a>
        </div>

        <script>
          function playStrongAlert() {
            try {
              const AudioContext = window.AudioContext || window.webkitAudioContext;
              if (!AudioContext) return;
              const ctx = new AudioContext();

              const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.value = freq;

                gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(ctx.currentTime + startTime);
                osc.stop(ctx.currentTime + startTime + duration);
              };

              playTone(440, 0, 0.2);
              playTone(330, 0.25, 0.3);
            } catch (e) {
              console.log("Audio not allowed by browser autoplay policy until interaction.");
            }
          }

          window.addEventListener('load', () => {
            playStrongAlert();
          });

          document.addEventListener('click', () => {
            playStrongAlert();
          }, { once: true });
        </script>
      </body>
    </html>
  `;
}

module.exports = { generateFailPageHtml };
