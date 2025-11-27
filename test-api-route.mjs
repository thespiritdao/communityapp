// Quick test to verify API route is accessible
const response = await fetch('http://localhost:3000/api/sensemaker/chat', {
  method: 'GET'
});

console.log('Status:', response.status);
console.log('Content-Type:', response.headers.get('content-type'));

const text = await response.text();
console.log('Response preview:', text.substring(0, 300));

if (response.headers.get('content-type')?.includes('application/json')) {
  console.log('\n✅ API route is working - returns JSON');
} else {
  console.log('\n❌ API route is NOT working - returns HTML (404 page)');
  console.log('Full response:', text);
}
