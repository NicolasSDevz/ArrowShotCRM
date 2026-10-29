// O servidor da Vercel usa url.parse() para ler o endereço de cada requisição, e o
// Node 24 avisa (DEP0169) em toda chamada. O aviso não vem do nosso código e só polui
// os logs como "erro". Este arquivo cala só esse aviso; os outros continuam aparecendo.
// Importar primeiro em cada função de api/.
const original = process.emitWarning
process.emitWarning = function (warning, ...args) {
  const opt = args[0]
  const code = opt && typeof opt === 'object' ? opt.code : args[1]
  if (code === 'DEP0169') return
  return original.call(process, warning, ...args)
}
