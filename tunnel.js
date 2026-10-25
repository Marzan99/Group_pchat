const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');

console.log('================================================================');
console.log('  🌐 Paramount Group PChat — Connecting to Cloudflare Tunnel...');
console.log('================================================================');
console.log('Please wait 5-10 seconds for the public secure link...\n');

const child = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:4000']);

let urlFound = false;

function handleOutput(data) {
  const str = data.toString();
  const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  
  if (match && !urlFound) {
    urlFound = true;
    const publicUrl = match[0];

    console.log('\n================================================================');
    console.log('🎉 YOUR SECURE PUBLIC CHAT LINK IS READY!');
    console.log('👉 ' + publicUrl);
    console.log('================================================================');
    console.log('\n💡 এই লিংকটি কপি করে বাংলাদেশের যেকোনো ব্রাঞ্চের মেম্বারকে দিন।');
    console.log('তারা মোবাইল বা পিসি থেকে এই লিংকে ঢুকে সরাসরি চ্যাট করতে পারবে।');
    console.log('লিংকটি "PUBLIC_CHAT_URL.txt" ফাইলেও সেভ করা হয়েছে।');
    console.log('================================================================\n');

    // Save to text file
    fs.writeFileSync(path.join(__dirname, 'PUBLIC_CHAT_URL.txt'), `Paramount Group PChat Public Link:\n${publicUrl}\n\nGenerated on: ${new Date().toLocaleString()}\n`);

    // Automatically open in default browser
    exec(`start ${publicUrl}`);
  }
}

child.stdout.on('data', handleOutput);
child.stderr.on('data', handleOutput);

child.on('close', (code) => {
  console.log(`Tunnel closed with code ${code}`);
});

process.on('SIGINT', () => {
  child.kill();
  process.exit();
});
