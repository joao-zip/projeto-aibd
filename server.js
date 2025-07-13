const express = require("express");
const Redis = require("ioredis");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const port = process.env.port || 3000;

const redis = new Redis();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Crud

app.post("/item", async (req, res) => {
  const { key, value } = req.body;
  if (!key || !value) {
    return res.status(400).send("Key e Value são obrigatórios.");
  }
  try {
    await redis.set(key, value);
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
    const keys = await redis.keys("*");
    const items = {};
    for (const key of keys) {
      items[key] = await redis.get(key);
    }
    res.json(items);
  } catch (error) {
    console.error("Erro ao listar itens:", error);
    res.status(500).send("Erro ao listar itens.");
  }
});

app.put("/item/:key", async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (!value) {
    return res.status(400).send("Value é obrigatório para atualização.");
  }
  try {
    const exists = await redis.exists(key);
    if (exists) {
      await redis.set(key, value);
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
      res.send("Item deletado com sucesso!");
    } else {
      res.status(404).send("Item não encontrado para deleção.");
    }
  } catch (error) {
    console.error("Erro ao deletar item:", error);
    res.status(500).send("Erro ao deletar item.");
  }
});

app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
