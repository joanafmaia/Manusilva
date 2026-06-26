# MS.015 — Proposta Comercial / Orçamentos

Ficheiros:

- `MS.015-proposta-comercial-orcamentos.docx` — modelo oficial da empresa (fonte).
- `MS.015-orcamento-template.docx` — versão com placeholders `{cliente_nome}`, `{maquina}`, etc., gerada por:

```bash
python scripts/prepare-ms015-orcamento-template.py
```

Quando o técnico marca **Pedido de Orçamento = Sim**, a PWA preenche o template e anexa **Word + PDF** ao relatório para o RH.

Para atualizar o modelo após alterações no Word da rede:

1. Copiar `\\DI\Manusilva Escritório\MS.015- Proposta Comercial Orçamentos.docx` para `MS.015-proposta-comercial-orcamentos.docx`.
2. Executar o script acima.
