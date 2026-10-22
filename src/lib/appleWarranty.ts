// ============================================================================
// CONTROLPHONE — TERMO DE GARANTIA APPLE (1 ANO) DOS APARELHOS LACRADOS
// Texto integral fornecido pelo proprietário da loja. NÃO resumir nem reescrever.
// Cada versão fica guardada aqui para sempre: a venda grava a versão apresentada
// e o PDF dela sai sempre com o mesmo texto, mesmo que surja uma versão nova.
// Para atualizar o termo: adicionar uma versão nova e apontar CURRENT para ela.
// ============================================================================

import { Device, SaleItem } from '../types';

export interface AppleWarrantySection {
  heading?: string;
  paragraphs: string[];
}

export interface AppleWarrantyTermVersion {
  version: string;
  title: string;
  subtitle: string;
  sections: AppleWarrantySection[];
}

export const APPLE_WARRANTY_TERM_ID = 'apple-garantia-limitada-1-ano';
export const APPLE_WARRANTY_COMPONENT_TITLE = 'Termo de Garantia — Apple (1 Ano)';

const V2026_10_21: AppleWarrantyTermVersion = {
  version: '2026-10-21',
  title: 'Garantia Limitada de um (1) ano',
  subtitle: 'Somente para produtos da marca Apple',
  sections: [
    {
      heading: 'COMO A LEI DO CONSUMIDOR SE APLICA A ESTA GARANTIA',
      paragraphs: [
        'ESTA GARANTIA CONCEDE DIREITOS LEGAIS ESPECÍFICOS AO ADQUIRENTE, QUE PODE TER OUTROS DIREITOS QUE VARIAM CONFORME O ESTADO (OU PAÍS). COM EXCEÇÃO DO PERMITIDO POR LEI, A APPLE NÃO EXCLUI, LIMITA NEM SUSPENDE QUAISQUER OUTROS DIREITOS QUE VOCÊ POSSA TER, INCLUSIVE AQUELES DECORRENTES DA NÃO CONFORMIDADE COM O CONTRATO DE VENDA. PARA O PLENO CONHECIMENTO DE SEUS DIREITOS, CONSULTE AS LEIS APLICÁVEIS DE SEU PAÍS, PROVÍNCIA OU ESTADO.'
      ]
    },
    {
      heading: 'LIMITAÇÕES DA GARANTIA SUJEITAS AO CÓDIGO DE DEFESA DO CONSUMIDOR',
      paragraphs: [
        'NA MEDIDA PERMITIDA POR LEI, ESTA GARANTIA E AS CONDIÇÕES ORA PREVISTAS SÃO EXCLUSIVAS E SUBSTITUEM TODAS AS DEMAIS GARANTIAS, REPARAÇÕES E CONDIÇÕES, SEJAM VERBAIS, ESCRITAS, LEGAIS, EXPRESSAS OU IMPLÍCITAS. A APPLE SE ISENTA DE TODAS AS GARANTIAS LEGAIS E IMPLÍCITAS, INCLUSIVE, ENTRE OUTRAS, GARANTIAS DE COMERCIALIZAÇÃO E ADEQUAÇÃO A UM PROPÓSITO ESPECÍFICO E GARANTIAS CONTRA DEFEITOS OCULTOS OU NÃO APARENTES, NA MEDIDA EM QUE FOR PERMITIDO POR LEI. SE A ISENÇÃO DESSAS GARANTIAS NÃO FOR PERMITIDA, A APPLE LIMITARÁ A DURAÇÃO E OS RECURSOS DE TAIS GARANTIAS À DURAÇÃO DESTA GARANTIA EXPRESSA E, A SEU CRITÉRIO, OS SERVIÇOS DE REPARO OU SUBSTITUIÇÃO DESCRITOS ABAIXO. ALGUNS ESTADOS E PAÍSES NÃO PERMITEM LIMITAÇÕES À DURAÇÃO DE UMA GARANTIA (OU CONDIÇÃO) IMPLÍCITA, POR ISSO A LIMITAÇÃO ACIMA PODE NÃO SE APLICAR A VOCÊ.'
      ]
    },
    {
      heading: 'O QUE ESTÁ COBERTO POR ESTA GARANTIA?',
      paragraphs: [
        'A Apple garante o produto de hardware da marca Apple e os acessórios da marca Apple contidos na embalagem original ("Produto Apple") contra defeitos de fabricação e mão de obra quando utilizados sob condições normais, de acordo com as diretrizes da Apple, pelo período de UM (1) ANO contado da data da compra pelo usuário final ("Período de Garantia"). O Período de Garantia já inclui o prazo de garantia legal previsto na legislação de seu país ou estado. As diretrizes publicadas pela Apple incluem, entre outras, informações contidas nas especificações técnicas, nos manuais do usuário e nas comunicações de serviço.',
        'Nota: Todas as reclamações efetuadas durante o período da Garantia Limitada de Um Ano da Apple serão regidas pelos termos desta Garantia.'
      ]
    },
    {
      heading: 'O QUE NÃO ESTÁ COBERTO POR ESTA GARANTIA?',
      paragraphs: [
        'Esta Garantia não é aplicável a nenhum produto de hardware que não seja da marca Apple e a nenhum software, ainda que embalado ou vendido com o hardware da Apple. Isso não afeta seus direitos conforme previsto no Código de Defesa do Consumidor. Os fabricantes, fornecedores ou distribuidores de outras marcas que não a Apple podem fornecer suas próprias Garantias. Entre em contato com eles para obter mais informações. O software distribuído pela Apple, seja da marca Apple ou não (inclusive, entre outros, software de sistema), não está coberto por esta Garantia. Consulte o contrato de licenciamento que acompanha o software para obter detalhes sobre seus direitos de uso. A Apple não garante que o funcionamento do Produto Apple será ininterrupto ou sem erros. A Apple não se responsabiliza por danos decorrentes de falha no cumprimento das instruções relacionadas ao uso do Produto Apple.',
        'Esta Garantia não é aplicável: (a) a peças consumíveis, como baterias ou revestimentos protetores desenvolvidos para se desgastarem com o tempo, a menos que haja uma falha causada por defeito de material ou fabricação; (b) a danos estéticos, inclusive arranhões, amassados e plástico quebrado nas portas a menos que a falha ocorra devido a um defeito de material ou fabricação; (c) a danos causados pelo uso de um componente ou produto de terceiros que não atenda às especificações do Produto Apple (as especificações do Produto Apple estão disponíveis em www.apple.com/br, na seção de especificações técnicas de cada produto, e também nas lojas); (d) a danos causados por acidentes, violação, mau uso, incêndios, terremotos ou outras causas externas; (e) a danos causados pelo uso do Produto Apple fora das diretrizes publicadas pela Apple; (f) a danos causados por serviços (inclusive upgrades e expansões) realizados por pessoas que não sejam representantes da Apple ou de um Centro de Serviço Autorizado Apple ("AASP"); (g) a Produtos Apple modificados para alterar a funcionalidade ou capacidade sem permissão por escrito da Apple; (h) a defeitos causados pelo desgaste ou o envelhecimento normal do Produto Apple; (i) se o número de série for removido ou apagado do Produto Apple; ou (j) se a Apple receber informações de autoridades públicas apropriadas de que o produto foi roubado ou se você não puder desativar o código de acesso ou outras medidas de segurança desenvolvidas para evitar o acesso não autorizado ao Produto Apple, e se você não puder provar de forma alguma que é o usuário autorizado do produto (por exemplo, ao apresentar o comprovante de compra).'
      ]
    },
    {
      heading: 'RESTRIÇÃO IMPORTANTE.',
      paragraphs: [
        'A Apple poderá restringir a garantia dos produtos de hardware nos países em que ela ou seus Distribuidores Autorizados comercializaram originalmente o produto.'
      ]
    },
    {
      heading: 'RESPONSABILIDADES DO CLIENTE',
      paragraphs: [
        'VOCÊ DEVE FAZER CÓPIAS DE SEGURANÇA (BACKUP) PERIÓDICAS DAS INFORMAÇÕES CONTIDAS NA MÍDIA DE ARMAZENAMENTO DO PRODUTO APPLE COMO FORMA DE PROTEÇÃO DO CONTEÚDO E DE PRECAUÇÃO CONTRA EVENTUAIS FALHAS OPERACIONAIS.',
        'Antes de receber um serviço dentro do período de garantia, a Apple ou seus representantes poderão solicitar ao Cliente que forneça os detalhes do comprovante de compra, responda às perguntas formuladas para auxiliar no diagnóstico de possíveis problemas e siga os procedimentos da Apple para obter o serviço dentro do período de garantia. Antes de enviar o Produto Apple para obter o serviço dentro do período de garantia, você deve manter uma cópia separada do conteúdo da mídia de armazenamento, remover todas as informações pessoais que queira proteger e desabilitar todas as senhas de segurança.',
        'DURANTE O SERVIÇO DENTRO DO PERÍODO DE GARANTIA, O CONTEÚDO DA MÍDIA DE ARMAZENAMENTO SERÁ APAGADO E REFORMATADO. A APPLE E SEUS REPRESENTANTES NÃO SE RESPONSABILIZAM PELA PERDA DE PROGRAMAS DE SOFTWARE, DADOS OU OUTRAS INFORMAÇÕES CONTIDAS NA MÍDIA DE ARMAZENAMENTO OU EM QUALQUER OUTRA PEÇA DO PRODUTO APPLE REPARADO.',
        'Após o serviço dentro do período de garantia, será entregue a você seu Produto Apple ou um dispositivo de substituição, com configurações idênticas ao originalmente adquirido, estando sujeito, no entanto, às atualizações aplicáveis. A Apple poderá instalar atualizações do software de sistema como parte do serviço dentro do período de garantia, o que evitará que o Produto Apple retorne a uma versão anterior do software de sistema. Em razão da atualização do software de sistema, aplicativos de terceiros instalados no Produto Apple poderão ser incompatíveis ou não funcionar com o Produto Apple. Caberá a você reinstalar todos os outros programas de software, dados e informações. A recuperação e a reinstalação de outros programas de software, dados e informações não estão cobertas por esta Garantia.',
        'Importante: Não tente abrir o Produto Apple ou remover qualquer capa protetora presa a este. A abertura do Produto Apple ou a remoção de capas protetoras poderão causar danos que não são cobertos por esta Garantia. Apenas a Apple ou um AASP poderá realizar o serviço no Produto Apple.'
      ]
    },
    {
      heading: 'QUE MEDIDAS A APPLE ADOTARÁ NO CASO DE DESCUMPRIMENTO DA GARANTIA?',
      paragraphs: [
        'Se durante o Período de Garantia você enviar uma reivindicação válida à Apple ou a um AASP de acordo com esta garantia, a Apple terá uma destas opções:',
        '(i) reparar o Produto Apple utilizando peças originais da Apple que foram testadas e aprovadas pelos requisitos funcionais da Apple,',
        '(ii) substituir o Produto Apple por um produto de substituição do mesmo modelo (ou, com seu consentimento, por um produto com recursos idênticos ou substancialmente similares ao produto original; por exemplo, um modelo diferente com os mesmos recursos ou o mesmo modelo em outra cor) que seja novo ou considerado novo e/ou, mediante consentimento por escrito, peças originais da Apple usadas anteriormente e que tenham sido testadas e aprovadas pelos requisitos funcionais da Apple, ou',
        '(iii) trocar o Produto Apple por um reembolso do preço da compra.',
        'A Apple poderá solicitar que você substitua algumas peças do Produto Apple com possibilidade de instalação realizada pelo usuário. A peça ou o Produto Apple de substituição, inclusive uma peça com possibilidade de instalação realizada pelo usuário que foi instalada de acordo com as instruções fornecidas pela Apple, terá o prazo restante da Garantia ou 90 (noventa) dias da data da substituição ou do reparo, o que tiver uma cobertura maior. Na hipótese de troca do Produto Apple ou de partes e peças, bem como de reembolso do valor do Produto Apple ou de partes e peças, qualquer que seja o item de reposição, e os itens substituídos serão de sua propriedade ou os itens substituídos ou reembolsados se tornarão propriedades da Apple e deverão ser devolvidos à Apple.'
      ]
    },
    {
      heading: 'COMO OBTER O SERVIÇO DENTRO DO PERÍODO DE GARANTIA?',
      paragraphs: [
        'Acesse e verifique os recursos de ajuda online descritos abaixo antes de solicitar um serviço em garantia. Se o Produto Apple não funcionar adequadamente após a execução das medidas recomendadas, entre em contato com um representante da Apple ou, se for o caso, uma loja de varejo da Apple (“Apple Store”) ou um Centro de Serviço Autorizado Apple (AASP), usando as informações fornecidas abaixo. Um representante da Apple ou AASP ajudará a determinar se o seu Produto Apple precisa de serviço e, nesse caso, informará como a Apple o fornecerá. Quando você entra em contato com a Apple por telefone, tarifas telefônicas podem ser cobradas, dependendo da sua localidade.',
        'Informações online com os detalhes sobre a obtenção do serviço dentro do período de garantia são fornecidas abaixo.'
      ]
    },
    {
      heading: 'OPÇÕES DE SERVIÇO DENTRO DO PERÍODO DE GARANTIA',
      paragraphs: [
        'A Apple fornecerá serviço dentro do período de garantia por meio de uma ou mais das seguintes opções:',
        '(i) Serviço na autorizada. Você pode devolver o Produto Apple a uma Apple Store ou a um AASP que ofereça o Serviço na autorizada. O serviço será realizado no próprio local ou na Apple Store, ou um AASP poderá enviar o seu Produto Apple para a realização do serviço em um centro de Serviço de Reparo da Apple (ARS). Quando for avisado de que o serviço foi concluído, você imediatamente retirará o Produto Apple da Apple Store ou do AASP, a menos que a Apple informe que o Produto Apple será enviado diretamente do ARS para o seu endereço.',
        '(ii) Serviço de envio por remessa. Caso a Apple determine que seu Produto Apple está qualificado para o serviço de envio por remessa, a Apple enviará os documentos de postagem pré-pago e, se for o caso, material de embalagem, para que você possa enviar o Produto Apple para um ARS ou AASP de acordo com as instruções da Apple. Na finalização do serviço, o ARS ou a AASP devolverá o Produto Apple ao cliente. A Apple efetuará o pagamento dos custos de envio de e para a sua localidade, se todas as instruções para o Produto Apple forem seguidas.',
        '(iii) Serviço com peças do tipo Faça você mesmo (DIY). O serviço com peças do tipo Faça você mesmo (DIY) permite que você repare seu próprio Produto Apple. Se o serviço com peças do tipo Faça você mesmo (DIY) estiver disponível, o seguinte procedimento será aplicável.',
        '(a) Serviço em que a Apple solicita a devolução da peça ou do Produto Apple substituídos. A Apple poderá solicitar, por segurança, uma autorização de cobrança em cartão de crédito do valor de varejo do Produto Apple ou da peça de substituição e dos custos de envio aplicáveis. Caso você não possa fornecer a autorização de cobrança em cartão de crédito, o serviço com peças do tipo Faça você mesmo (DIY) pode não ser disponibilizado, e a Apple oferecerá alternativa para a realização do serviço. A Apple enviará um Produto Apple ou peça de substituição para você com instruções de instalação, se aplicável, e quaisquer outros requisitos para a devolução do Produto Apple ou peça substituído. Se você seguir as instruções, a Apple cancelará a autorização de cobrança em cartão de crédito para que o Produto Apple ou a peça, e também o envio de e para o seu endereço não sejam cobrados. Se você não devolver o Produto Apple ou as peças substituídos como instruído ou se devolver um Produto Apple ou uma peça que não esteja qualificado para serviço, a Apple debitará no seu cartão de crédito o valor autorizado.',
        '(b) Suporte em que a Apple não solicita a devolução da peça ou do Produto Apple substituídos. A Apple lhe enviará, sem custos, um Produto Apple ou uma peça de substituição acompanhados de instruções de instalação, se aplicável, e quaisquer requisitos para o descarte do Produto Apple ou peça substituídos.',
        '(c) A Apple não se responsabiliza por quaisquer custos de mão de obra que você venha a incorrer relacionados ao serviço com peças do tipo Faça você mesmo (DIY). Se precisar de mais ajuda, entre em contato com a Apple pelo número de telefone indicado abaixo.',
        'A Apple reserva-se o direito de alterar o método pelo qual pode fornecer o serviço dentro do período de garantia e a qualificação do seu Produto Apple para receber um determinado método de suporte. O serviço limita-se às opções disponíveis no país em que ele é solicitado. As opções de serviço, a disponibilidade de peças e o tempo de resposta podem variar conforme o país. A Apple poderá usar Produtos Apple ou peças de substituição para serviço provenientes de um país diferente do qual o Produto Apple ou as peças originais foram obtidas. Você poderá ser responsável pelas despesas de envio e manuseio se o Produto Apple não puder ser reparado no país em que se encontra. Se solicitar o serviço em um país que não seja o original da compra, você cumprirá todas as leis e os regulamentos de importação e exportação aplicáveis e se responsabilizará por todas as taxas alfandegárias, IVA e outros impostos e tarifas aplicáveis. Nos locais em que o suporte internacional estiver disponível, a Apple poderá reparar ou substituir as peças e os Produtos Apple por peças e Produtos Apple similares que atendam aos padrões locais.'
      ]
    },
    {
      heading: 'LIMITAÇÃO DE RESPONSABILIDADE',
      paragraphs: [
        'EXCETO CONFORME PREVISTO NESTA GARANTIA E NA MEDIDA MÁXIMA PERMITIDA PELA LEGISLAÇÃO APLICÁVEL, A APPLE NÃO SE RESPONSABILIZA POR DANOS DIRETOS, ESPECIAIS, INCIDENTAIS OU CONSEQUENCIAIS RESULTANTES DE UM DESCUMPRIMENTO DA GARANTIA OU CONDIÇÃO, OU SOB QUALQUER OUTRA TEORIA JURÍDICA, INCLUSIVE, ENTRE OUTRAS, A PERDA DE UTILIDADE, PERDA DE RECEITA, LUCROS CESSANTES REAIS OU PREVISTOS (INCLUSIVE LUCROS CESSANTES EM CONTRATOS), PERDA DE VALOR MONETÁRIO, PERDA DE ECONOMIA PREVISTA, PERDA DE NEGÓCIOS, PERDA DE OPORTUNIDADES, PERDA DE CREDIBILIDADE, PERDA DE REPUTAÇÃO, PERDA, DANOS, COMPROMETIMENTO OU CORRUPÇÃO DE DADOS OU QUAISQUER PERDAS OU DANOS INDIRETOS OU CONSEQUENCIAIS, INDEPENDENTEMENTE DA FORMA COMO FORAM CAUSADOS, INCLUSIVE A SUBSTITUIÇÃO DE EQUIPAMENTO E PROPRIEDADE, QUAISQUER CUSTOS DE RECUPERAÇÃO, PROGRAMAÇÃO OU REPRODUÇÃO DE QUALQUER PROGRAMA OU DADO ARMAZENADO OU UTILIZADO COM O PRODUTO APPLE OU QUALQUER FALHA EM MANTER A CONFIDENCIALIDADE DAS INFORMAÇÕES ARMAZENADAS NELE.',
        'A LIMITAÇÃO ACIMA NÃO SE APLICA ÀS REIVINDICAÇÕES POR MORTE OU LESÃO CORPORAL NEM A QUALQUER OBRIGAÇÃO PREVISTA EM LEI POR ATOS NEGLIGENTES GRAVES E INTENCIONAIS E/OU OMISSÕES. A APPLE NÃO FORNECE NENHUMA GARANTIA DE QUE FARÁ O REPARO EM UM PRODUTO APPLE SOB ESTA GARANTIA OU SUBSTITUIRÁ O PRODUTO APPLE SEM RISCO OU PERDA DAS INFORMAÇÕES NELE ARMAZENADAS.',
        'ALGUNS ESTADOS (PAÍSES E PROVÍNCIAS) NÃO PERMITEM A EXCLUSÃO OU LIMITAÇÃO DE DANOS INCIDENTAIS OU CONSEQUENCIAIS, POR ISSO A LIMITAÇÃO OU EXCLUSÃO ACIMA PODEM NÃO SE APLICAR A VOCÊ.'
      ]
    },
    {
      heading: 'DISPOSIÇÕES GERAIS',
      paragraphs: [
        'Nenhum revendedor, representante ou funcionário da Apple está autorizado a fazer qualquer modificação, extensão ou adendo a esta Garantia. Se um termo for considerado ilegal ou inexequível, a legalidade ou a aplicabilidade dos termos restantes não serão afetadas nem prejudicadas. Esta Garantia é regida e interpretada de acordo com as leis do país onde a compra do Produto Apple foi realizada. A Apple está identificada ao final deste documento, de acordo com o país ou a região onde a compra do Produto Apple foi realizada. A Apple ou seus sucessores nomeados são os garantidores desta Garantia.'
      ]
    },
    {
      heading: 'INFORMAÇÕES ONLINE',
      paragraphs: [
        'Mais informações sobre os serviços abaixo estão disponíveis online:',
        'Informações de suporte internacional',
        'www.apple.com/support/country',
        'Distribuidores autorizados',
        'support.apple.com/kb/HT1434',
        'Centro de Serviço Autorizado Apple',
        'support.apple.com/pt-br/HT1937',
        'support.apple.com/kb/HT1434',
        'Apple Store',
        'www.apple.com/retail/storelist/',
        'Serviço e suporte da Apple',
        'www.apple.com/support/contact/phone_contacts.html',
        'Suporte gratuito da Apple',
        'www.apple.com/support/country/?dest=complimentary'
      ]
    }
  ]
};

/** Todas as versões já usadas (nunca remover uma versão: vendas antigas apontam para ela). */
export const APPLE_WARRANTY_VERSIONS: Record<string, AppleWarrantyTermVersion> = {
  [V2026_10_21.version]: V2026_10_21
};
export const APPLE_WARRANTY_CURRENT = V2026_10_21;

export const appleWarrantyVersion = (version?: string): AppleWarrantyTermVersion =>
  (version && APPLE_WARRANTY_VERSIONS[version]) || APPLE_WARRANTY_CURRENT;

/** Texto corrido do termo (título, subtítulo, títulos das seções e parágrafos), usado na conferência do texto integral */
export const appleWarrantyPlainText = (term: AppleWarrantyTermVersion) =>
  [term.title, term.subtitle, ...term.sections.flatMap(s => [s.heading || '', ...s.paragraphs])].filter(Boolean).join('\n');

type DeviceLike = Pick<Device, 'brand' | 'model'> & { device_type?: Device['device_type'] };

/** Aparelho lacrado da marca Apple: recebe o termo Apple. Seminovo e outras marcas, não. */
export const isAppleSealed = (d?: DeviceLike) =>
  Boolean(d && d.device_type === 'lacrado' && (/\bapple\b/i.test(d.brand || '') || /\biphone\b/i.test(d.model || '')));

/** Item de venda com aparelho Apple lacrado (pelo retrato gravado na venda). */
export const isAppleSealedItem = (it: SaleItem) =>
  it.item_type === 'device' && it.device_type === 'lacrado' &&
  (/\bapple\b/i.test(it.device_info?.brand || '') || /\biphone\b/i.test(it.device_info?.model || ''));
