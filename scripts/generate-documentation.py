from __future__ import annotations

import hashlib
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT_PATH = OUTPUT_DIR / "SaudeConnect-Documentacao-Tecnica.pdf"
SCREENSHOT_DIR = ROOT / "docs" / "screenshots"
APK_PATH = ROOT / "SaudeConnect_v1.0.0.APK"

TEAL = colors.HexColor("#0F8B8D")
TEAL_DARK = colors.HexColor("#0B5F61")
BLUE = colors.HexColor("#2563EB")
INK = colors.HexColor("#1F2937")
MUTED = colors.HexColor("#697586")
LINE = colors.HexColor("#DDE5EE")
PALE = colors.HexColor("#F5F7FB")
GREEN = colors.HexColor("#159947")
ORANGE = colors.HexColor("#E07A2F")
PURPLE = colors.HexColor("#7152B7")

PT_REPLACEMENTS = {
    "Versao": "Versão",
    "Pagina": "Página",
    "Documentacao": "Documentação",
    "documentacao": "documentação",
    "tecnica": "técnica",
    "administracao": "administração",
    "Administracao": "Administração",
    "seguranca": "segurança",
    "Seguranca": "Segurança",
    "publicacao": "publicação",
    "distribuicao": "distribuição",
    "Aplicacao": "Aplicação",
    "aplicacao": "aplicação",
    "integracao": "integração",
    "integracoes": "integrações",
    "saude": "saúde",
    "Saude": "Saúde",
    "usuarios": "usuários",
    "Usuarios": "Usuários",
    "usuario": "usuário",
    "Usuario": "Usuário",
    "unica": "única",
    "Visao": "Visão",
    "solucao": "solução",
    "validacao": "validação",
    "autenticacao": "autenticação",
    "Autenticacao": "Autenticação",
    "permissao": "permissão",
    "permissoes": "permissões",
    "gestao": "gestão",
    "operacao": "operação",
    "Operacao": "Operação",
    "conexao": "conexão",
    "Prontuarios": "Prontuários",
    "prontuarios": "prontuários",
    "Cartao": "Cartão",
    "posicao": "posição",
    "estimativa": "estimativa",
    "servicos": "serviços",
    "Servicos": "Serviços",
    "Decisoes": "Decisões",
    "requisicoes": "requisições",
    "sessao": "sessão",
    "sessoes": "sessões",
    "expiracao": "expiração",
    "configuravel": "configurável",
    "sensiveis": "sensíveis",
    "Variaveis": "Variáveis",
    "variaveis": "variáveis",
    "configuracao": "configuração",
    "Observacao": "Observação",
    "producao": "produção",
    "persistencia": "persistência",
    "proximas": "próximas",
    "selecao": "seleção",
    "historico": "histórico",
    "inclusao": "inclusão",
    "indicadores": "indicadores",
    "publico": "público",
    "Publico": "Público",
    "alteracao": "alteração",
    "Atualizacao": "Atualização",
    "Organizacao": "Organização",
    "repositorio": "repositório",
    "Repositorio": "Repositório",
    "rapido": "rápido",
    "Navegacao": "Navegação",
    "publicas": "públicas",
    "protegidas": "protegidas",
    "gratuito": "gratuito",
    "cabecalhos": "cabeçalhos",
    "Observacao": "Observação",
    "criacao": "criação",
    "Primeiro": "Primeiro",
    "proximas": "próximas",
    "acao": "ação",
    "Atividade": "Atividade",
    "Metodo": "Método",
    "Execucao": "Execução",
    "Verificacoes": "Verificações",
    "compativel": "compatível",
    "compativeis": "compatíveis",
    "instalacao": "instalação",
    "Instalacao": "Instalação",
    "politica": "política",
    "aparelhos": "aparelhos",
    "analise": "análise",
    "relatorio": "relatório",
}


def pt(text: str) -> str:
    for source, target in PT_REPLACEMENTS.items():
        text = re.sub(rf"\b{re.escape(source)}\b", target, text)
    return text


class ArchitectureDiagram(Flowable):
    def __init__(self, width: float, height: float = 182):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        canvas = self.canv
        box_width = self.width - 24
        box_height = 31
        left = 12
        boxes = [
            ("Clientes", "React web, PWA e aplicativo Android via Capacitor", TEAL),
            ("API", "Express, rotas REST, validacao Zod, CORS e rate limit", BLUE),
            ("Seguranca", "JWT, bcrypt, Google OAuth, perfis de usuario e administrador", PURPLE),
            ("Dados", "SQLite local, uploads, auditoria e adaptacao serverless para Vercel", ORANGE),
        ]
        y = self.height - box_height - 4
        for index, (title, subtitle, accent) in enumerate(boxes):
            canvas.setFillColor(colors.white)
            canvas.setStrokeColor(LINE)
            canvas.roundRect(left, y, box_width, box_height, 8, fill=1, stroke=1)
            canvas.setFillColor(accent)
            canvas.roundRect(left, y, 7, box_height, 4, fill=1, stroke=0)
            canvas.setFillColor(INK)
            canvas.setFont("Helvetica-Bold", 10)
            canvas.drawString(left + 18, y + 18, pt(title))
            canvas.setFillColor(MUTED)
            canvas.setFont("Helvetica", 8.2)
            canvas.drawString(left + 18, y + 7, pt(subtitle))
            if index < len(boxes) - 1:
                canvas.setStrokeColor(colors.HexColor("#9FCFD0"))
                canvas.setLineWidth(1.4)
                center = left + box_width / 2
                canvas.line(center, y - 7, center, y)
                canvas.line(center - 3, y - 4, center, y - 7)
                canvas.line(center + 3, y - 4, center, y - 7)
            y -= box_height + 11


def paragraph_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=29,
            leading=32,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=18,
            textColor=MUTED,
            spaceAfter=10,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=21,
            leading=25,
            textColor=INK,
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=TEAL_DARK,
            spaceBefore=8,
            spaceAfter=7,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=14,
            textColor=INK,
            spaceAfter=7,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10.5,
            textColor=MUTED,
        ),
        "caption": ParagraphStyle(
            "Caption",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=7.6,
            leading=10,
            textColor=MUTED,
            alignment=TA_CENTER,
            spaceBefore=4,
            spaceAfter=9,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.5,
            leading=10.5,
            textColor=colors.HexColor("#243244"),
            backColor=colors.HexColor("#F2F6F9"),
            borderColor=LINE,
            borderWidth=0.5,
            borderPadding=7,
            spaceAfter=8,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=13,
            textColor=TEAL_DARK,
        ),
    }


STYLES = paragraph_styles()


def P(text: str, style: str = "body") -> Paragraph:
    return Paragraph(pt(text), STYLES[style])


def bullet(text: str) -> Paragraph:
    return Paragraph(f"<font color='#0F8B8D'>-</font> {pt(text)}", STYLES["body"])


def scaled_image(path: Path, max_width: float, max_height: float) -> Image:
    image = Image(str(path))
    scale = min(max_width / image.imageWidth, max_height / image.imageHeight)
    image.drawWidth = image.imageWidth * scale
    image.drawHeight = image.imageHeight * scale
    image.hAlign = "CENTER"
    return image


def screenshot_block(filename: str, caption: str, max_height: float = 190) -> KeepTogether:
    path = SCREENSHOT_DIR / filename
    return KeepTogether([
        scaled_image(path, 166 * mm, max_height),
        P(caption, "caption"),
    ])


def screenshot_cell(filename: str, caption: str):
    return [
        scaled_image(SCREENSHOT_DIR / filename, 78 * mm, 53 * mm),
        P(caption, "caption"),
    ]


def info_table(rows, widths=None):
    rows = [[pt(str(cell)) for cell in row] for row in rows]
    table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.8),
        ("LEADING", (0, 0), (-1, -1), 10.5),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def draw_later_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(TEAL_DARK)
    canvas.rect(0, height - 8 * mm, width, 8 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(18 * mm, height - 5.3 * mm, pt("SaudeConnect | Documentacao tecnica e operacional"))
    canvas.setStrokeColor(LINE)
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(18 * mm, 9 * mm, pt("Versao 1.0 - 18 de junho de 2026"))
    canvas.drawRightString(width - 18 * mm, 9 * mm, pt(f"Pagina {doc.page}"))
    canvas.restoreState()


def draw_first_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(TEAL_DARK)
    canvas.rect(0, height - 15 * mm, width, 15 * mm, fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.circle(width - 25 * mm, 26 * mm, 23 * mm, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.circle(width - 7 * mm, 34 * mm, 14 * mm, fill=1, stroke=0)
    canvas.restoreState()


def build_story():
    apk_size_mb = APK_PATH.stat().st_size / (1024 * 1024) if APK_PATH.exists() else 0
    apk_hash = hashlib.sha256(APK_PATH.read_bytes()).hexdigest().upper() if APK_PATH.exists() else "APK nao encontrado"
    story = []

    story.extend([
        Spacer(1, 24 * mm),
        P("SAUDECONNECT", "cover_meta"),
        Spacer(1, 4 * mm),
        P("Documentacao tecnica e operacional", "title"),
        P("Guia de arquitetura, funcionamento, administracao, seguranca, publicacao web e distribuicao Android.", "subtitle"),
        Spacer(1, 5 * mm),
        scaled_image(SCREENSHOT_DIR / "02-inicio-desktop.png", 168 * mm, 82 * mm),
        Spacer(1, 8 * mm),
        info_table([
            ["Projeto", "Versao", "Ambientes"],
            ["SaudeConnect", "1.0", "Web responsiva, PWA e Android"],
        ], [55 * mm, 35 * mm, 76 * mm]),
        Spacer(1, 8 * mm),
        P("Aplicacao full-stack para integrar usuarios, unidades de saude e equipes administrativas em uma experiencia unica.", "body"),
        P("Repositorio: <link href='https://github.com/JOAO2666/SaudeConnectl'>github.com/JOAO2666/SaudeConnectl</link><br/>Demo: <link href='https://saudeconnectl.vercel.app'>saudeconnectl.vercel.app</link>", "small"),
        PageBreak(),
    ])

    story.extend([
        P("1. Visao geral", "h1"),
        P("O SaudeConnect organiza a jornada digital do paciente e oferece uma central administrativa para acompanhar demanda, atendimento e integracoes. A interface foi desenhada para celular, tablet e computador, mantendo as mesmas regras de negocio em todos os formatos.", "body"),
        P("Escopo funcional", "h2"),
        bullet("Autenticacao por e-mail e senha, alem de Google OAuth configuravel."),
        bullet("Mapa interativo de unidades com OpenStreetMap, Leaflet, marcadores e rotas."),
        bullet("Cadastro do cidadao com perfil, Cartao SUS, contatos e foto."),
        bullet("Prontuarios, resultados, triagem digital, fila e agendamentos."),
        bullet("Painel administrativo com busca, indicadores, gestao de status, usuarios, chamados, avisos, auditoria e exportacao CSV."),
        bullet("Aplicativo Android empacotado com Capacitor."),
        Spacer(1, 4 * mm),
        P("Perfis de acesso", "h2"),
        info_table([
            ["Perfil", "Responsabilidades e recursos"],
            ["Usuario", "Consulta dados pessoais, unidades, agenda, prontuarios, triagem e fila digital."],
            ["Administrador", "Opera agenda, triagem, fila, integracoes, permissoes, chamados, avisos e auditoria."],
        ], [38 * mm, 128 * mm]),
        Spacer(1, 6 * mm),
        screenshot_block("01-login-desktop.png", "Tela de acesso com cadastro, login local e entrada pelo Google.", 88 * mm),
        PageBreak(),
    ])

    story.extend([
        P("2. Arquitetura da solucao", "h1"),
        P("A aplicacao usa uma arquitetura web em camadas. O cliente React consome uma API REST Express. A API valida entradas, autentica requisicoes, aplica permissoes e persiste os dados. Na Vercel, a API e empacotada como funcao serverless; no Docker ou ambiente local, o Express roda como servidor tradicional.", "body"),
        ArchitectureDiagram(166 * mm),
        Spacer(1, 4 * mm),
        P("Fluxo de uma operacao", "h2"),
        info_table([
            ["Etapa", "Descricao"],
            ["1. Interface", "O usuario preenche um formulario ou aciona um comando."],
            ["2. API", "O cliente envia JSON para uma rota sob /api."],
            ["3. Seguranca", "O JWT e validado e a permissao do perfil e conferida."],
            ["4. Regra de negocio", "Zod valida o payload e o servidor executa a operacao."],
            ["5. Dados e auditoria", "SQLite registra a alteracao e audit_logs recebe o evento."],
            ["6. Atualizacao", "A interface recarrega os dados e apresenta o resultado."],
        ], [30 * mm, 136 * mm]),
        Spacer(1, 7 * mm),
        P("Organizacao do repositorio", "h2"),
        P("src/ - interface React e tipos\n<br/>server/ - API, autenticacao, banco e regras\n<br/>api/ - adaptador serverless da Vercel\n<br/>android/ - projeto nativo Capacitor\n<br/>docs/ e store-assets/ - capturas e materiais de publicacao\n<br/>scripts/ - testes visuais, capturas e geracao desta documentacao", "code"),
        PageBreak(),
    ])

    story.extend([
        P("3. Tecnologias", "h1"),
        info_table([
            ["Camada", "Tecnologia", "Finalidade"],
            ["Interface", "React 19 + TypeScript", "Componentes, estado, rotas e tipagem."],
            ["Build", "Vite 8", "Desenvolvimento rapido e pacote de producao."],
            ["Navegacao", "React Router 7", "Rotas publicas, protegidas e administrativas."],
            ["Mapa", "Leaflet + OpenStreetMap", "Mapa gratuito, marcadores, zoom e popup."],
            ["API", "Node.js + Express 5", "Endpoints REST e entrega local da aplicacao."],
            ["Dados", "SQLite + better-sqlite3", "Persistencia simples e transacional."],
            ["Validacao", "Zod", "Validacao de payloads no servidor."],
            ["Seguranca", "JWT, bcryptjs, Helmet", "Sessao, hash de senha e cabecalhos seguros."],
            ["OAuth", "Passport Google OAuth 2.0", "Login Google e criacao automatica do usuario."],
            ["Mobile", "Capacitor 8 + Android", "Empacotamento do site como aplicativo."],
            ["Hospedagem", "Vercel + Docker", "Demo serverless e alternativa conteinerizada."],
            ["Qualidade", "ESLint + Puppeteer", "Analise estatica e verificacao visual."],
        ], [31 * mm, 47 * mm, 88 * mm]),
        Spacer(1, 8 * mm),
        P("Decisoes de interface", "h2"),
        bullet("Layout responsivo com sidebar adaptada para telas menores."),
        bullet("Cartoes com hierarquia visual, estados, icones Lucide e animacoes de hover."),
        bullet("Movimento reduzido respeitado por prefers-reduced-motion."),
        bullet("Mapa sem chave paga e controles familiares de navegacao."),
        PageBreak(),
    ])

    story.extend([
        P("4. Autenticacao e seguranca", "h1"),
        P("Senhas locais sao transformadas com bcrypt e nunca sao armazenadas em texto puro. O login gera um JWT assinado, com identificador de sessao, validade e perfil. Rotas administrativas executam authRequired e adminRequired antes da regra de negocio.", "body"),
        info_table([
            ["Controle", "Implementacao"],
            ["Senha", "Minimo de 10 caracteres, maiuscula, minuscula, numero e simbolo."],
            ["Hash", "bcrypt com custo 12."],
            ["Sessao", "JWT com TTL configuravel e jti para identificacao."],
            ["Google", "OAuth 2.0; primeiro acesso cria usuario comum e abre a triagem."],
            ["Permissao", "role user/admin, middleware dedicado e protecao contra auto-rebaixamento."],
            ["API", "Helmet, CORS por origem, limite de requisicoes e Zod."],
            ["Auditoria", "Eventos importantes registrados em audit_logs."],
        ], [41 * mm, 125 * mm]),
        Spacer(1, 8 * mm),
        P("Variaveis sensiveis", "h2"),
        P("JWT_SECRET, GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET devem existir apenas no ambiente de hospedagem. O arquivo OAuth e .env ficam ignorados pelo Git e nunca devem ser enviados ao repositorio.", "body"),
        P("JWT_SECRET=valor-longo-e-aleatorio\n<br/>CLIENT_URL=https://seu-dominio\n<br/>CLIENT_ORIGIN=https://seu-dominio\n<br/>GOOGLE_CALLBACK_URL=https://seu-dominio/api/auth/google/callback", "code"),
        P("Observacao de producao", "h2"),
        P("A demo da Vercel usa armazenamento temporario para SQLite e uploads. Dados permanentes exigem banco e armazenamento gerenciados. O codigo local e Docker continuam aptos a usar DATA_DIR persistente.", "body"),
        PageBreak(),
    ])

    story.extend([
        P("5. Jornada do usuario", "h1"),
        bullet("Primeiro acesso: cadastro local ou Google, seguido pela triagem inicial."),
        bullet("Inicio: indicadores, proximas consultas, resultados, triagens e fila."),
        bullet("Mapa: selecao de unidade, detalhes, telefone, horario e Como Chegar."),
        bullet("Cadastro: dados do cidadao e foto de perfil."),
        bullet("Prontuarios: historico de receitas, vacinas e atendimentos."),
        bullet("Triagem: sintomas, prioridade percebida e recomendacao."),
        bullet("Fila: entrada por unidade e servico, posicao e estimativa."),
        Spacer(1, 5 * mm),
        screenshot_block("02-inicio-desktop.png", "Inicio do paciente com indicadores e agenda.", 78 * mm),
        screenshot_block("06-triagem-desktop.png", "Triagem com historico e novo registro.", 78 * mm),
        PageBreak(),
    ])

    story.extend([
        P("6. Mapa, cadastro e prontuarios", "h1"),
        screenshot_block("03-mapa-desktop.png", "Mapa OpenStreetMap com lista, marcadores e acao de rota.", 78 * mm),
        Table(
            [[
                screenshot_cell("04-cadastro-desktop.png", "Cadastro do cidadao e foto."),
                screenshot_cell("05-prontuarios-desktop.png", "Linha do tempo de prontuarios."),
            ]],
            colWidths=[83 * mm, 83 * mm],
            style=TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]),
        ),
        PageBreak(),
    ])

    story.extend([
        P("7. Administracao da rede", "h1"),
        P("A area administrativa consolida operacao e governanca. A busca filtra as listas, o relatorio CSV exporta a situacao atual e os controles alteram dados pela API com auditoria.", "body"),
        bullet("Indicadores de usuarios, agenda, triagem e fila."),
        bullet("Saude da rede e latencia das integracoes."),
        bullet("Mudanca de status de agenda, triagem, fila, chamados e integracoes."),
        bullet("Gestao de perfil usuario/administrador."),
        bullet("Publicacao de avisos segmentados para todos, usuarios ou administradores."),
        bullet("Atividade recente e exportacao CSV."),
        Spacer(1, 5 * mm),
        screenshot_block("08-admin-desktop.png", "Painel administrativo ampliado com central operacional.", 174 * mm),
        PageBreak(),
    ])

    story.extend([
        P("8. Modelo de dados e API", "h1"),
        P("Tabelas principais", "h2"),
        info_table([
            ["Tabela", "Responsabilidade"],
            ["users", "Identidade, provedor, papel e ultimo acesso."],
            ["auth_sessions", "Sessoes locais, expiracao e revogacao."],
            ["units", "Unidades, coordenadas, horario e servicos."],
            ["appointments / exams", "Agenda e resultados do paciente."],
            ["patient_profiles / records", "Cadastro e prontuario."],
            ["triage_cases / queue_entries", "Triagem e fila digital."],
            ["support_tickets", "Solicitacoes de suporte."],
            ["announcements", "Avisos por publico."],
            ["integrations / audit_logs", "Saude de servicos e trilha administrativa."],
        ], [53 * mm, 113 * mm]),
        Spacer(1, 7 * mm),
        P("Rotas de referencia", "h2"),
        info_table([
            ["Metodo", "Rota", "Uso"],
            ["POST", "/api/auth/register | /login", "Cadastro e autenticacao."],
            ["GET", "/api/auth/google", "Inicio do OAuth Google."],
            ["GET", "/api/dashboard | /units", "Resumo e mapa."],
            ["PUT", "/api/profile", "Atualizacao cadastral."],
            ["POST", "/api/triage | /queue | /appointments", "Jornada assistencial."],
            ["GET", "/api/admin/overview", "Central administrativa."],
            ["PATCH", "/api/admin/*/:id", "Status, integracoes e permissoes."],
            ["POST", "/api/admin/announcements", "Publicacao de avisos."],
        ], [22 * mm, 72 * mm, 72 * mm]),
        PageBreak(),
    ])

    story.extend([
        P("9. Execucao, testes e publicacao", "h1"),
        P("Ambiente local", "h2"),
        P("npm install\n<br/>npm run build\n<br/>npm run start", "code"),
        P("Desenvolvimento com recarga automatica", "h2"),
        P("npm run dev", "code"),
        P("Verificacoes", "h2"),
        P("npm run lint\n<br/>npm run build\n<br/>node scripts/smoke-visual.mjs\n<br/>npm run screenshots", "code"),
        P("Vercel", "h2"),
        P("O arquivo vercel.json compila a interface em dist e encaminha /api para a funcao api/[...path].js. As variaveis de ambiente devem ser cadastradas no projeto Vercel antes da publicacao.", "body"),
        P("vercel --prod", "code"),
        P("Docker e Hugging Face", "h2"),
        P("O Dockerfile instala dependencias, compila a aplicacao e inicia o Express na porta configurada. O mesmo conteiner pode ser usado em qualquer servico Docker compativel.", "body"),
        P("Android", "h2"),
        P("npm run mobile:sync\n<br/>npm run mobile:apk", "code"),
        PageBreak(),
    ])

    story.extend([
        P("10. APK e entrega", "h1"),
        P("O APK fornecido foi incluido no repositorio para instalacao direta em dispositivos Android compativeis. Para a Play Store, deve ser gerado um App Bundle assinado com chave de release e configurada a ficha do aplicativo.", "body"),
        info_table([
            ["Item", "Valor"],
            ["Arquivo", APK_PATH.name if APK_PATH.exists() else "Nao encontrado"],
            ["Tamanho", f"{apk_size_mb:.2f} MB"],
            ["SHA-256", apk_hash],
            ["Origem da API", "Configurada no build do aplicativo"],
        ], [37 * mm, 129 * mm]),
        Spacer(1, 7 * mm),
        P("Instalacao de teste", "h2"),
        bullet("Baixe o APK pelo repositorio GitHub."),
        bullet("No Android, autorize a instalacao pelo navegador ou gerenciador de arquivos usado."),
        bullet("Abra o arquivo e confirme a instalacao."),
        bullet("Teste login, mapa, triagem e fila com conexao de internet."),
        Spacer(1, 5 * mm),
        screenshot_block("07-fila-desktop.png", "Fila digital compartilhando as mesmas regras entre web e Android.", 92 * mm),
        P("Checklist antes de producao", "h2"),
        bullet("Trocar credenciais de demonstracao e revisar usuarios administradores."),
        bullet("Conectar banco e armazenamento persistentes."),
        bullet("Configurar dominios OAuth, monitoramento, backups e politica de privacidade."),
        bullet("Gerar APK/AAB assinado e executar testes em aparelhos reais."),
    ])
    return story


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=17 * mm,
        bottomMargin=18 * mm,
        title="SaudeConnect - Documentacao tecnica e operacional",
        author="SaudeConnect",
        subject="Arquitetura, funcionamento, tecnologias, administracao e Android",
    )
    document.build(build_story(), onFirstPage=draw_first_page, onLaterPages=draw_later_page)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
