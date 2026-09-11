function generateFailPageHtml(errorMessage) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>فشل العملية - شبكة حكايات</title>
        
        <!-- ربط الأيقونة -->
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Cairo, sans-serif; background: #fef2f2; text-align: center; padding: 40px 20px; direction: rtl; margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
          .container { background: white; max-width: 480px; width: 100%; margin: auto; padding: 35px 20px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); animation: shake 0.5s ease-in-out; }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-8px); }
            40%, 80% { transform: translateX(8px); }
          }
          .fail-badge { color: #e74c3c; font-size: 60px; margin-bottom: 10px; }
          h1 { color: #c0392b; font-size: 22px; margin-bottom: 15px; }
          p { color: #555; font-size: 14px; line-height: 1.6; margin-bottom: 25px; }
          .btn { background: #01338D; color: white; padding: 12px 25px; border: none; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; transition: background 0.3s; }
          .btn:hover { background: #001f5c; }
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
          // كود توليد صوت تنبيه ويب قوي (Beep Alert) فور فتح الصفحة
          function playStrongAlert() {
            try {
              const AudioContext = window.AudioContext || window.webkitAudioContext;
              if (!AudioContext) return;
              const ctx = new AudioContext();

              // تشغيل نغمتين متتاليتين للتنبيه السريع والقوي
              const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sawtooth'; // صوت حاد وقوي يلفت الانتباه
                osc.frequency.value = freq;

                gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(ctx.currentTime + startTime);
                osc.stop(ctx.currentTime + startTime + duration);
              };

              playTone(440, 0, 0.2);     // النغمة الأولى
              playTone(330, 0.25, 0.3);  // النغمة الثانية الهابطة تدل على الفشل
            } catch (e) {
              console.log("Audio not allowed by browser autoplay policy until interaction.");
            }
          }

          // محاولة تشغيل الصوت عند تحميل الصفحة مباشرة
          window.addEventListener('load', () => {
            playStrongAlert();
          });

          // محاولة تفعيل الصوت أيضاً إذا تفاعل المستخدم بأي ضغطة في الصفحة
          document.addEventListener('click', () => {
            playStrongAlert();
          }, { once: true });
        </script>
      </body>
    </html>
  `;
}

module.exports = { generateFailPageHtml };
