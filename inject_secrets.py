import os

# Script que cria o arquivo de configuração a partir das variáveis secretas de ambiente para deploy
content = f"""const firebaseConfig = {{
  apiKey: "{os.getenv('FIREBASE_API_KEY')}",
  authDomain: "{os.getenv('FIREBASE_AUTH_DOMAIN')}",
  projectId: "{os.getenv('FIREBASE_PROJECT_ID')}",
  storageBucket: "{os.getenv('FIREBASE_STORAGE_BUCKET')}",
  messagingSenderId: "{os.getenv('FIREBASE_MESSAGING_SENDER_ID')}",
  appId: "{os.getenv('FIREBASE_APP_ID')}",
  measurementId: "{os.getenv('FIREBASE_MEASUREMENT_ID')}"
}};"""

with open('config.js', 'w') as f:
    f.write(content)