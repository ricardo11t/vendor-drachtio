# Setup do GitHub Actions para Deploy Drachtio

## 1. Verificar o repositório correto

O workflow está no repositório **`vendor-drachtio`** (separado do `vendor-backend-nestjs`).

Certifique-se que você está em:
- `https://github.com/ricardo11t/vendor-drachtio`

## 2. Criar as Secrets

Você precisa adicionar 3 **Environment Secrets** no GitHub:

### Passo a passo:

1. **Ir para Settings do repositório vendor-drachtio**
   - https://github.com/ricardo11t/vendor-drachtio/settings

2. **Ir para Environments**
   - Settings > Environments
   - Clique em `deploy_production`

3. **Adicionar os 3 secrets:**

#### `EC2_HOST`
- **Valor**: IP ou hostname do seu EC2
- Exemplo: `141.11.73.93` ou `ec2-user.compute.amazonaws.com`

#### `EC2_USERNAME`
- **Valor**: Usuário SSH do EC2
- Se é Ubuntu: `ubuntu`
- Se é Amazon Linux: `ec2-user`
- Se é Debian: `admin`

#### `EC2_SSH_KEY`
- **Valor**: Sua chave SSH em base64

**Para gerar a chave em base64:**

```bash
# Se você tem a chave PEM:
cat ~/.ssh/seu-arquivo-key.pem | base64

# No Mac:
cat ~/.ssh/seu-arquivo-key.pem | base64 | pbcopy

# No Linux:
cat ~/.ssh/seu-arquivo-key.pem | base64 --wrap=0
```

Copie a saída completa e cole no GitHub.

## 3. Verificar SSH acesso

Antes de fazer o deploy, teste a conexão SSH:

```bash
ssh -i /path/to/key.pem ubuntu@141.11.73.93
```

Se conectar com sucesso, o GitHub Actions também funcionará.

## 4. Estrutura esperada no EC2

O workflow espera encontrar em uma destas localizações:
- `$HOME/vendor-drachtio/` ✅ **Recomendado**
- `$HOME/projects/vendor-drachtio/`
- `/opt/vendor-drachtio/`

Certifique-se que:
```bash
# No seu EC2:
ls ~/vendor-drachtio/docker-compose.yml
# Deve retornar o arquivo
```

## 5. Debug do workflow

Se o deployment falhar:

1. Vá para **Actions** no GitHub
2. Clique no workflow que falhou
3. Veja os logs detalhados
4. O workflow agora tem `debug: true` então mostrará tudo

## 6. Trigger manual

Você pode fazer deploy sem fazer commit:

1. Vá para **Actions**
2. Selecione **Deploy Vendor Drachtio**
3. Clique **Run workflow**
4. Selecione a branch e clique **Run**

## Troubleshooting

### Erro: "missing server host"
- **Causa**: `EC2_HOST` não está configurado ou está vazio
- **Solução**: Verifique em Settings > Environments > deploy_production > Secrets

### Erro: "Permission denied (publickey)"
- **Causa**: Chave SSH está errada ou não tem permissão
- **Solução**: 
  ```bash
  # Verificar permissões da chave
  chmod 600 ~/.ssh/seu-arquivo-key.pem
  
  # Testar conexão manual
  ssh -i ~/.ssh/seu-arquivo-key.pem ubuntu@141.11.73.93
  ```

### Erro: "Diretório vendor-drachtio não encontrado"
- **Causa**: Caminho do diretório está diferente
- **Solução**: 
  ```bash
  # No EC2, encontre o diretório:
  find $HOME -type d -name "vendor-drachtio" 2>/dev/null
  ```

### Erro: "docker-compose.yml não encontrado"
- **Causa**: Arquivo não existe no repositório
- **Solução**: Verifique se você fez push do arquivo para o GitHub

## Monitoramento

Após o deploy bem-sucedido:

```bash
# Conectar no EC2
ssh -i ~/.ssh/seu-arquivo-key.pem ubuntu@141.11.73.93

# Verificar containers
docker ps
docker logs vendor-drachtio

# Verificar Drachtio
curl http://localhost:9023/health || echo "Drachtio ainda está iniciando..."
```
