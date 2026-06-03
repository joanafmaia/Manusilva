# Supabase Auth — equipa ManuSilva

## Criar utilizadores (Dashboard → Authentication → Users)

Para cada membro, use o **e-mail** da tabela `UTILIZADORES` e palavra-passe inicial no formato:

`PrimeiraLetraDoNome` + resto em minúsculas + `.2026`  
Ex.: Hugo → `Hugo.2026` · Joana → `Joana.2026`

## Metadados (User Metadata JSON)

```json
{
  "nome": "Hugo",
  "role": "Tecnico",
  "technician_id": "tech-1"
}
```

RH: `"role": "RH"` (sem `technician_id`).

## Redirect de redefinição

Authentication → URL Configuration → adicione o URL do site (ex. `https://manusilva.vercel.app/index.html`).
