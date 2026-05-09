import { BrowserClient } from './src/browser/client';
import { RemajuNavigator } from './src/browser/navigator';
import { config } from './src/config';

async function testTotal() {
  const client = new BrowserClient();

  console.log('\n🔢 Total Remates Test');
  console.log('━'.repeat(40));

  await client.initialize();
  const navigator = new RemajuNavigator(client);

  try {
    await navigator.navigateToRemaju();

    const { totalRows, totalPages, currentPage } = await navigator.getPaginationInfo();

    console.log(`Total remates : ${totalRows}`);
    console.log(`Total páginas : ${totalPages}  (12 por página)`);
    console.log(`Página actual : ${currentPage}`);
    console.log('');

    if (totalRows === 0) {
      console.log('⚠️  No se detectó el total — revisá el selector del paginador');
      await navigator.takeDebugScreenshot('total-not-found');
    } else {
      console.log('✅ Total detectado correctamente');
    }
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    await navigator.takeDebugScreenshot('total-error');
  } finally {
    await client.close();
    console.log('');
  }
}

testTotal();
