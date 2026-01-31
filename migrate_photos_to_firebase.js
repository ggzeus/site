const admin = require("firebase-admin");
const fs = require('fs');
const path = require('path');

// Initialize Firebase (same as server.js)
const serviceAccount = require("./firebase-service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'scarlet-d5061.appspot.com'
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function migrateProfilePhotos() {
    console.log('🚀 Iniciando migração de fotos de perfil para Firebase Storage...\n');

    const uploadsDir = path.join(__dirname, 'uploads');

    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
        console.log('❌ Pasta /uploads não encontrada. Nada para migrar.');
        return;
    }

    // Get all users from Firestore
    const usersSnapshot = await db.collection('users').get();
    let migratedCount = 0;
    let errorCount = 0;

    for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        const profilePic = userData.profile_pic;

        // Only migrate if profile_pic starts with /uploads/
        if (profilePic && profilePic.startsWith('/uploads/')) {
            const filename = profilePic.replace('/uploads/', '');
            const localPath = path.join(uploadsDir, filename);

            // Check if file exists
            if (!fs.existsSync(localPath)) {
                console.log(`⚠️  Arquivo não encontrado: ${filename} (usuário: ${userData.username})`);
                continue;
            }

            try {
                // Read file
                const buffer = fs.readFileSync(localPath);

                // Determine content type
                const extension = path.extname(filename).substring(1);
                const contentType = `image/${extension}`;

                // Upload to Firebase Storage
                const firebaseFilename = `profile_pics/${userId}_migrated_${Date.now()}.${extension}`;
                const file = bucket.file(firebaseFilename);

                await file.save(buffer, {
                    metadata: {
                        contentType: contentType,
                        cacheControl: 'public, max-age=31536000',
                    }
                });

                // Make publicly accessible
                await file.makePublic();

                // Get public URL
                const publicUrl = `https://storage.googleapis.com/${bucket.name}/${firebaseFilename}`;

                // Update user document in Firestore
                await db.collection('users').doc(userId).update({
                    profile_pic: publicUrl
                });

                console.log(`✅ Migrado: ${userData.username} -> ${publicUrl}`);
                migratedCount++;

            } catch (error) {
                console.error(`❌ Erro ao migrar ${filename}:`, error.message);
                errorCount++;
            }
        }
    }

    console.log('\n📊 Resumo da Migração:');
    console.log(`   ✅ Fotos migradas: ${migratedCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log('\n🎉 Migração concluída!');

    if (migratedCount > 0) {
        console.log('\n⚠️  IMPORTANTE: As fotos antigas ainda estão na pasta /uploads.');
        console.log('   Você pode deletá-las manualmente se quiser liberar espaço.');
    }
}

// Run migration
migrateProfilePhotos()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Erro fatal na migração:', error);
        process.exit(1);
    });
