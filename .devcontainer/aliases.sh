# ~/.zshrc で使っていた alias をここに移植する。
# alias 構文は zsh / bash で共通なので、基本はそのままコピペで動く。
#
# ※ zsh 固有のもの(alias -g / alias -s、setopt、%F{...} など)は bash では動かないので注意。
# ※ alias を消す/リネームしたときは、既存ターミナルには残り続けるので
#    ターミナルを開き直すか unalias する。

# 対話ターミナルのBashで使う
case $- in
  *i*) ;;
  *) return ;;
esac

# --- ファイル操作 ---
alias ll='ls -la'
alias la='ls -A'

# --- npm ---
alias dev='npm run dev'

# --- git ---
alias gb='git branch'
alias gbd='git branch -d'
alias gbD='git branch -D'
alias gs='git switch'
alias gsc='git switch -c'
alias gd='git diff'
alias gsd='git switch develop'
alias fet='git fetch'
alias gmm='git merge --ff-only origin/main'
alias pull='git pull'
alias push='git push origin HEAD'
alias log='git log --pretty=fuller -3'
alias reset='git reset --soft HEAD~1'
alias rebase='git rebase develop'

# --- プロンプト(Mac の ~/.zshrc の見た目に合わせる) ---
# ~/.zsh/git-prompt.sh と同じ書式で (ブランチ名 記号) を組み立てる。
#   *  コミットしていない編集がある(unstaged)
#   +  git add 済みの変更がある(staged)
#   $  stash がある
#   %  未追跡ファイルがある
#   =  upstream と同じ / <  遅れている / >  進んでいる / <> 両方
git_branch() {
  local branch marks counts

  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

  if [ "$branch" = "" ]; then
    return
  fi

  marks=''
  git diff --quiet 2>/dev/null || marks="$marks*"
  git diff --cached --quiet 2>/dev/null || marks="$marks+"
  git rev-parse --verify --quiet refs/stash >/dev/null 2>&1 && marks="$marks\$"
  [ "$(git ls-files --others --exclude-standard 2>/dev/null)" != "" ] && marks="$marks%"

  # upstream との進み/遅れ。upstream 未設定なら何も出さない。
  counts=$(git rev-list --count --left-right @{upstream}...HEAD 2>/dev/null)
  if [ "$counts" != "" ]; then
    set -- $counts
    if [ "$1" != 0 ] && [ "$2" != 0 ]; then
      marks="$marks<>"
    elif [ "$1" != 0 ]; then
      marks="$marks<"
    elif [ "$2" != 0 ]; then
      marks="$marks>"
    else
      marks="$marks="
    fi
  fi

  if [ "$marks" = "" ]; then
    printf ' (%s)' "$branch"
  else
    printf ' (%s %s)' "$branch" "$marks"
  fi
}

# bash は \[ \] で囲んだ部分を表示幅ゼロとして扱うので、色のエスケープはそこに入れる。
# \u@\h は whoami@hostname、\w は Mac の %~ と同じくホーム配下を ~ に省略する。
# \$ は root なら #、それ以外なら $ になる。
PS1='\[\e[32m\]\u@\h\[\e[0m\]: \[\e[36m\]\w\[\e[0m\]\[\e[31m\]$(git_branch)\[\e[0m\]
\$ '