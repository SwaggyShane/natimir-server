const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812 });
  
  // Go to app
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  // Login
  await page.type('#login-email', 'BIGstieny@gmail.com');
  await page.type('#login-password', 'password'); // Assuming some password or dummy
  await page.click('button[onclick="doLogin()"]');
  
  await page.waitForTimeout(2000);
  
  // Click alliances
  await page.evaluate(() => {
    switchTab('alliances', document.querySelector('.nav-item[onclick*="alliances"]'));
  });
  
  await page.waitForTimeout(2000);
  
  const layout = await page.evaluate(() => {
    function getRect(id) {
       const el = document.getElementById(id) || document.querySelector(id);
       if (!el) return null;
       const rect = el.getBoundingClientRect();
       const style = window.getComputedStyle(el);
       return { 
         id: el.id || el.className, 
         top: rect.top, 
         bottom: rect.bottom, 
         height: rect.height, 
         display: style.display,
         flex: style.flex,
         marginTop: style.marginTop,
         paddingTop: style.paddingTop,
         marginBottom: style.marginBottom,
         justifyContent: style.justifyContent
       };
    }
    
    return {
      main: getRect('.main'),
      app: getRect('.app'),
      kdTop: getRect('#kd-top'),
      kdHeader: getRect('.kingdom-header'),
      metrics: getRect('.metrics'),
      metricGold: getRect('#metric-gold'),
      alliances: getRect('#alliances'),
      allyNone: getRect('#ally-none'),
      allyActive: getRect('#ally-active'),
      rGridSidebar: getRect('#ally-active .r-grid-sidebar'),
    };
  });
  
  console.log(JSON.stringify(layout, null, 2));
  await browser.close();
})();
