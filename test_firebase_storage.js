const admin = require("firebase-admin");

// Initialize Firebase
const serviceAccount = require("./firebase-service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'scarlet-d5061.appspot.com'
});

const bucket = admin.storage().bucket();

async function testFirebaseStorage() {
    console.log('🧪 Testando conexão com Firebase Storage...\n');

    try {
        // Test 1: Check bucket exists
        const [exists] = await bucket.exists();
        if (exists) {
            console.log('✅ Bucket conectado com sucesso!');
            console.log(`   Nome: ${bucket.name}`);
        } else {
            console.log('❌ Bucket não encontrado!');
            return;
        }

        // Test 2: Create a test file
        console.log('\n🧪 Testando upload...');
        const testContent = Buffer.from('Test file created at ' + new Date().toISOString());
        const testFile = bucket.file('test/connection_test.txt');

        await testFile.save(testContent, {
            metadata: {
                contentType: 'text/plain'
            }
        });
        console.log('✅ Upload de teste realizado!');

        // Test 3: Make it public
        await testFile.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/test/connection_test.txt`;
        console.log('✅ Arquivo tornado público!');
        console.log(`   URL: ${publicUrl}`);

        // Test 4: Delete test file
        await testFile.delete();
        console.log('✅ Arquivo de teste deletado!');

        console.log('\n✨ Todos os testes passaram! Firebase Storage está funcionando perfeitamente.');
        console.log('   Você pode fazer upload de fotos de perfil agora! 🎉\n');

    } catch (error) {
        console.error('❌ Erro ao testar Firebase Storage:', error.message);
        console.error('\n📋 Solução:');
        console.error('   1. Acesse: https://console.firebase.google.com');
        console.error('   2. Selecione o projeto: scarlet-d5061');
        console.error('   3. Vá em Storage e clique em "Get Started"');
        console.error('   4. Aceite as regras padrão e ative o Storage\n');
    }
}

testFirebaseStorage()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Erro:', error);
        process.exit(1);
    });
