import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'

const mdComponents = {
  h1: (props) => (
    <h1
      className='mb-3 mt-6 text-xl font-bold text-white first:mt-0 sm:text-2xl'
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className='mb-2 mt-5 text-lg font-semibold text-white first:mt-0 sm:text-xl'
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className='mb-2 mt-4 text-base font-semibold text-zinc-100 first:mt-0 sm:text-lg'
      {...props}
    />
  ),
  h4: (props) => (
    <h4 className='mb-2 mt-3 text-sm font-semibold text-zinc-200 sm:text-base' {...props} />
  ),
  p: (props) => <p className='mb-3 text-zinc-300 leading-relaxed last:mb-0' {...props} />,
  strong: (props) => <strong className='font-semibold text-white' {...props} />,
  em: (props) => <em className='italic text-zinc-200' {...props} />,
  ul: (props) => (
    <ul className='mb-3 list-disc space-y-1 pl-4 text-zinc-300 marker:text-zinc-500 sm:pl-6' {...props} />
  ),
  ol: (props) => (
    <ol className='mb-3 list-decimal space-y-1 pl-4 text-zinc-300 marker:text-zinc-500 sm:pl-6' {...props} />
  ),
  li: (props) => <li className='leading-relaxed' {...props} />,
  hr: () => <hr className='my-6 border-zinc-600' />,
  blockquote: (props) => (
    <blockquote
      className='mb-3 border-l-4 border-zinc-500 pl-4 text-zinc-400 italic'
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className
    return inline ? (
      <code className='rounded bg-zinc-700 px-1.5 py-0.5 text-sm text-amber-200' {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  pre: (props) => (
    <pre
      className='mb-3 overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-200'
      {...props}
    />
  ),
  a: (props) => (
    <a className='text-sky-400 underline underline-offset-2 hover:text-sky-300' {...props} />
  ),
}

export function MarkdownAnswer({ markdown }) {
  if (!markdown) return null

  return (
    <div className='max-w-full overflow-x-auto text-left break-words'>
      <ReactMarkdown remarkPlugins={[remarkBreaks]} components={mdComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
