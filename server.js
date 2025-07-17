const express = require("express");
const Redis = require("ioredis");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const port = process.env.port || 3000;

const redis = new Redis();

async function logActivity(action) {
  const logKey = 'activity_log';
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp}: ${action}`

  await redis.lpush(logKey, logEntry);
  await redis.ltrim(logKey, 0, 9);
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));


app.post("/item", async (req, res) => {
  const { key, value, tag } = req.body;
  if (!key || !value) {
    return res.status(400).send("Key e Value são obrigatórios.");
  }
  try {
    await redis.set(key, value);
    await redis.sadd('items_index', key);

    if (tag && typeof tag === 'string') {
      const tagArray = tag.split(',').map(tag => tag.trim());

      for (const tag of tagArray) {
        await redis.sadd(`tag:${tag}`, key);
      }
    }

    await logActivity(`Item criado - Chave: ${key}`);
    res.status(201).send("Item criado com sucesso!");
  } catch (error) {
    console.error("Erro ao criar item:", error);
    res.status(500).send("Erro ao criar item.");
  }
});

app.get("/item/:key", async (req, res) => {
  const { key } = req.params;
  try {
    const value = await redis.get(key);
    if (value) {
      await redis.zincrby('item_views', 1, key);
      res.json({ key, value });
    } else {
      res.status(404).send("Item não encontrado.");
    }
  } catch (error) {
    console.error("Erro ao ler item:", error);
    res.status(500).send("Erro ao ler item.");
  }
});

app.get("/items", async (req, res) => {
  try {
    const itemKeys = await redis.smembers('items_index');

    if (itemKeys.length === 0) {
      return res.json({});
    }

    const itemValues = await redis.mget(itemKeys);

    const items = {};
    itemKeys.forEach((key, index) => {
      items[key] = itemValues[index];
    });

    res.json(items);
  } catch (error) {
    console.error("Erro ao listar itens:", error);
    res.status(500).send("Erro ao listar itens.");
  }
});

app.put("/item/:key", async (req, res) => {
  const { key } = req.params;
  const { value, tags } = req.body;
  if (!value) {
    return res.status(400).send("Value é obrigatório para atualização.");
  }
  try {
    const exists = await redis.exists(key);
    if (exists) {
      await redis.set(key, value);

      if (tags && typeof tags === 'string') {
        const tagArray = tags.split(',').map(tag => tag.trim());
        for (const tag of tagArray) {
          await redis.sadd(`tag:${tag}`, key);
        }
      }

      await logActivity(`Item atualizado - Chave: ${key}`);
      res.send("Item atualizado com sucesso!");
    } else {
      res.status(404).send("Item não encontrado para atualização.");
    }
  } catch (error) {
    console.error("Erro ao atualizar item:", error);
    res.status(500).send("Erro ao atualizar item.");
  }
});

app.delete("/item/:key", async (req, res) => {
  const { key } = req.params;
  try {
    const deletedCount = await redis.del(key);
    if (deletedCount > 0) {
      await redis.srem('items_index', key);

      const tagKeys = await redis.keys('tag:*');
      for (const tagKey of tagKeys) {
        await redis.srem(tagKey, key);
      }
      
      await logActivity(`Item deletado - Chave: ${key}`);
      res.send("Item deletado com sucesso!");
    } else {
      res.status(404).send("Item não encontrado para deleção.");
    }
  } catch (error) {
    console.error("Erro ao deletar item:", error);
    res.status(500).send("Erro ao deletar item.");
  }
});

// contar o total de itens adicionados
app.get('/items/count', async (req, res) => {
  try {
    const count = await redis.scard('items_index');
    res.json({ totalItems: count });
  } catch (error) {
    console.error("Erro ao contar itens: ", error);
    res.status(500).send("Erro ao contar itens.");
  }
});

// Listar os logs de atividade
app.get('/logs', async (req, res) => {
  try {
    const logs = await redis.lrange('activity_log', 0, 9);
    res.json(logs);
  } catch (error) {
    console.error('Erro ao ler logs:', error);
    res.status(500).send('Erro ao ler logs.');
  }
});

// Incrementar "like" em um item
app.post('/item/:key/like', async (req, res) => {
  const { key } = req.params;
  try {
    const likeCount = await redis.incr(`likes:${key}`);
    res.json({ key: key, likes: likeCount });
  } catch(error) {
    console.error("Erro ao dar like:", error);
    res.status(500).send("Erro ao dar like.");
  }
});

// Listar itens por tag
app.get('/items/tag/:tagname', async (req, res) => {
  const { tagname } = req.params;
  try {
    const itemKeys = await redis.smembers(`tag:${tagname}`);
    if (itemKeys.length === 0) return res.json({});
    const itemValues = await redis.mget(itemKeys);
    const items = {};
    itemKeys.forEach((key, index) => { items[key] = itemValues[index]; });
    res.json(items);
  } catch (error) {
    console.error("Erro ao buscar por tag: ", error);
    res.status(500).send("Erro ao buscar por tag.");
  }
});

// Exibir um ranking de mais vistos
app.get('/leaderboard', async (req, res) => {
    try {
        const topItems = await redis.zrevrange('item_views', 0, 4, 'WITHSCORES');
        const leaderboard = [];
        for (let i = 0; i < topItems.length; i += 2) {
            leaderboard.push({ itemKey: topItems[i], views: topItems[i + 1] });
        }
        res.json(leaderboard);
    } catch (error) {
        console.error("Erro ao gerar leaderboard:", error);
        res.status(500).send("Erro ao gerar leaderboard.");
    }
});

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
